import { ID } from 'node-appwrite'
import { z } from 'zod'

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(128),
  email: z.email(),
  // Appwrite-Minimum sind 8 Zeichen; kein Maximum unter 265 (Argon2-Input)
  password: z.string().min(8).max(256),
  roles: z.array(z.string()).max(20).refine(values => values.every(isRole), { message: 'Unknown role' }).default([]),
})

/**
 * User anlegen („Add users", users.manage): Name, E-Mail, Passwort + optionale
 * Rollen-Labels. Eskalations-Schutz wie role.patch: nur Rollen vergeben, deren
 * Capabilities ⊆ den eigenen sind. E-Mail-Duplikat → sauberes 409.
 */
export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'users.manage')

  const body = await readValidatedBody(event, createUserSchema.parse)
  const roles = [...new Set(body.roles)]

  const actorCaps = capabilitiesFor(actor.labels)
  for (const role of roles) {
    if (!isRole(role)) continue
    for (const cap of ROLE_CAPABILITIES[role]) {
      if (!actorCaps.has(cap)) {
        throw createError({ status: 403, statusText: 'Cannot assign a role beyond your own permissions' })
      }
    }
  }

  const admin = createAdminClient(event)
  const user = await admin.users.create({
    userId: ID.unique(),
    email: body.email,
    password: body.password,
    name: body.name,
  }).catch((error) => {
    throw toH3Error(error, 'Could not create user')
  })

  if (roles.length > 0) {
    await admin.users.updateLabels({ userId: user.$id, labels: roles }).catch((error) => {
      throw toH3Error(error, 'User created, but roles could not be set')
    })
  }

  await recordAudit(event, {
    action: 'user.created',
    targetType: 'user',
    targetId: user.$id,
    targetName: body.name,
    // OHNE E-MAIL (Audit-Befund 2026-08-02, GDPR): die Adresse stand hier
    // dauerhaft — und `deleteUserCompletely` bekam sie nie zu fassen. Der
    // Contributor pseudonymisiert Audit-Zeilen (Art. 17 (3) e: die Struktur
    // überlebt, die Person nicht), er kannte aber nur actorName/ip/
    // metadata.name. Nach der Löschung des Kontos blieb die Adresse als
    // Klartext stehen — der Rest der Zeile zeigte auf einen Menschen, den es
    // nicht mehr gibt.
    //
    // Und sie wurde hier auch nicht gebraucht: WER angelegt wurde, beantworten
    // `targetId` (bleibt, ist nach `users.delete` niemandem mehr zuzuordnen)
    // und `targetName` (wird bei der Löschung geleert). Die Adresse trug nur
    // Wiedererkennung — genau das, was ein pseudonymisiertes Protokoll nicht
    // mehr können soll. Bestands-Zeilen räumt der Contributor mit
    // (`stripPersonalMetadata`).
    metadata: { roles },
  })

  setResponseStatus(event, 201)
  return { $id: user.$id, name: user.name, email: user.email, labels: roles }
})
