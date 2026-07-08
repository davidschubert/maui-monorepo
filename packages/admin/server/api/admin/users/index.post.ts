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
    metadata: { email: body.email, roles },
  })

  setResponseStatus(event, 201)
  return { $id: user.$id, name: user.name, email: user.email, labels: roles }
})
