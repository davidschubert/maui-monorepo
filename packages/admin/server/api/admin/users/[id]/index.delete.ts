/** DSGVO: einen User endgültig löschen (Admin) — nicht den eigenen Account. */
export default defineEventHandler(async (event) => {
  const adminUser = requireAdmin(event)

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }
  if (userId === adminUser.$id) {
    throw createError({ status: 400, statusText: 'You cannot delete your own account here' })
  }

  const admin = createAdminClient(event)

  let name = ''
  try {
    name = (await admin.users.get({ userId })).name
  }
  catch {
    throw createError({ status: 404, statusText: 'User not found' })
  }

  await admin.users.delete({ userId })

  await recordAudit(event, { action: 'user.deleted', targetType: 'user', targetId: userId, targetName: name })

  return { ok: true }
})
