/** DSGVO: einen User endgültig löschen (Admin) — nicht den eigenen Account. */
export default defineEventHandler(async (event) => {
  const adminUser = requirePermission(event, 'users.manage')

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }
  if (userId === adminUser.$id) {
    throw createError({ status: 400, statusText: 'You cannot delete your own account here' })
  }
  // Den letzten Admin nicht löschen
  await assertNotLastAdmin(event, userId)

  const admin = createAdminClient(event)

  let name: string
  try {
    name = (await admin.users.get({ userId })).name
  }
  catch {
    throw createError({ status: 404, statusText: 'User not found' })
  }

  await admin.users.delete({ userId })
    .catch((error) => { throw toH3Error(error, 'Could not delete user') })

  await recordAudit(event, { action: 'user.deleted', targetType: 'user', targetId: userId, targetName: name })

  return { ok: true }
})
