/** Theme-Studio: eigenes Theme löschen. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing theme id' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  await admin.tablesDB.deleteRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'custom_themes',
    rowId: id,
  }).catch((error) => { throw toH3Error(error, 'Theme not found') })

  await recordAudit(event, { action: 'theme.deleted', targetType: 'theme', targetId: id })
  return { ok: true }
})
