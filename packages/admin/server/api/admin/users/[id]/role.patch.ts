import { z } from 'zod'

const roleSchema = z.object({
  // Jeder Eintrag muss eine bekannte Rolle sein (isRole aus core/shared/authz).
  roles: z.array(z.string()).max(20).refine(values => values.every(isRole), { message: 'Unknown role' }),
})

/**
 * Rollen eines Users setzen (Mehrfachauswahl, als Appwrite-Labels gespeichert).
 * Ersetzt das frühere { admin: boolean }. Siehe docs/RBAC-CONCEPT.md.
 */
export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'users.manage')

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }

  const { roles } = await readValidatedBody(event, roleSchema.parse)
  const nextRoles = [...new Set(roles)]

  // Eskalations-Schutz: nur Rollen vergeben, deren Capabilities ⊆ den eigenen sind.
  const actorCaps = capabilitiesFor(actor.labels)
  for (const role of nextRoles) {
    if (!isRole(role)) continue
    for (const cap of ROLE_CAPABILITIES[role]) {
      if (!actorCaps.has(cap)) {
        throw createError({ status: 403, statusText: 'Cannot assign a role beyond your own permissions' })
      }
    }
  }

  const admin = createAdminClient(event)
  const target = await admin.users.get({ userId })
  const currentRoles = (target.labels ?? []).filter(isRole)

  const removingAdmin = currentRoles.includes('admin') && !nextRoles.includes('admin')
  // Kein Selbst-Lockout: die eigene Admin-Rolle nicht entziehen
  if (removingAdmin && userId === actor.$id) {
    throw createError({ status: 400, statusText: 'You cannot revoke your own admin role' })
  }
  // Es muss immer mindestens ein Admin übrig bleiben
  if (removingAdmin) {
    await assertNotLastAdmin(event, userId)
  }

  // Nur die Rollen-Labels ersetzen; etwaige Nicht-Rollen-Labels bleiben erhalten.
  const roleLabels = new Set<string>(ROLES)
  const preserved = (target.labels ?? []).filter(label => !roleLabels.has(label))
  const nextLabels = [...new Set([...preserved, ...nextRoles])]

  const updated = await admin.users.updateLabels({ userId, labels: nextLabels })

  await recordAudit(event, {
    action: 'user.roles_updated',
    targetType: 'user',
    targetId: updated.$id,
    targetName: updated.name,
    metadata: { before: currentRoles, after: nextRoles },
  })

  return { $id: updated.$id, labels: updated.labels }
})
