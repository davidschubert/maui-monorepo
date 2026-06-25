/** Admin: Changelog-Eintrag löschen. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'changelog.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  await admin.tablesDB.deleteRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'changelog',
    rowId: id,
  })

  await recordAudit(event, { action: 'changelog.deleted', targetType: 'changelog', targetId: id })
  return { ok: true }
})
