import { z } from 'zod'

const roleSchema = z.object({ admin: z.boolean() })

/** Admin-Rolle (Label) vergeben/entziehen — den eigenen Admin nie entziehen. */
export default defineEventHandler(async (event) => {
  const adminUser = requireAdmin(event)

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }

  const { admin: makeAdmin } = await readValidatedBody(event, roleSchema.parse)

  // Lockout-Schutz: sich selbst nicht den Admin entziehen
  if (!makeAdmin && userId === adminUser.$id) {
    throw createError({ status: 400, statusText: 'You cannot revoke your own admin role' })
  }

  const admin = createAdminClient(event)
  const target = await admin.users.get({ userId })

  const labels = new Set(target.labels ?? [])
  if (makeAdmin) labels.add('admin')
  else labels.delete('admin')

  const updated = await admin.users.updateLabels({ userId, labels: [...labels] })

  await recordAudit(event, {
    action: makeAdmin ? 'user.role_granted' : 'user.role_revoked',
    targetType: 'user',
    targetId: updated.$id,
    targetName: updated.name,
  })

  return { $id: updated.$id, labels: updated.labels }
})
