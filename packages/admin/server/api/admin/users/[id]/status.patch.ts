import { z } from 'zod'

const statusSchema = z.object({ blocked: z.boolean() })

/** Blockieren/Entsperren — der eigene Account ist nicht blockierbar. */
export default defineEventHandler(async (event) => {
  const adminUser = requireAdmin(event)

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }

  const { blocked } = await readValidatedBody(event, statusSchema.parse)

  if (blocked && userId === adminUser.$id) {
    throw createError({ status: 400, statusText: 'You cannot block your own account' })
  }
  // Den letzten Admin nicht aussperren
  if (blocked) {
    await assertNotLastAdmin(event, userId)
  }

  const admin = createAdminClient(event)
  // Appwrite-Semantik: status true = aktiv, false = blockiert
  const updated = await admin.users.updateStatus({ userId, status: !blocked })

  await recordAudit(event, {
    action: blocked ? 'user.block' : 'user.unblock',
    targetType: 'user',
    targetId: updated.$id,
    targetName: updated.name,
  })

  return { $id: updated.$id, status: updated.status }
})
