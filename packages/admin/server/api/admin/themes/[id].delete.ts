import type { Models } from 'node-appwrite'

/** Theme-Studio: eigenes Theme löschen. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing theme id' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  // Name VOR dem Löschen lesen — der Feed-Eintrag soll sagen, WAS wegfiel
  const row = await admin.tablesDB.getRow<Models.Row & { name?: string }>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'custom_themes',
    rowId: id,
  }).catch((error) => { throw toH3Error(error, 'Theme not found') })

  await admin.tablesDB.deleteRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'custom_themes',
    rowId: id,
  }).catch((error) => { throw toH3Error(error, 'Theme not found') })

  await recordAudit(event, { action: 'theme.deleted', targetType: 'theme', targetId: id, targetName: row.name ?? '' })

  // Activity-Feed (Core-Vertrag, best-effort)
  const user = event.context.user!
  await recordActivity(event, {
    actorId: user.$id,
    actorName: user.name,
    type: 'theme.deleted',
    objectType: 'theme',
    objectId: id,
    link: '/',
    metadata: { snippet: row.name ?? '' },
  })

  return { ok: true }
})
