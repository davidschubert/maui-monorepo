/**
 * DSGVO: Daten eines Users als JSON exportieren (Admin) + Audit.
 * Zusammensetzung (Account + Sessions + alle UserDataContributors) macht
 * exportUserCompletely — vollständig paginiert, kein Feature-Wissen hier.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.manage')

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }

  const payload = await exportUserCompletely(event, userId, { via: 'admin' })
    .catch((error) => { throw toH3Error(error, 'User not found') })

  await recordAudit(event, { action: 'user.exported', targetType: 'user', targetId: userId, targetName: payload.account.name })

  return payload
})
