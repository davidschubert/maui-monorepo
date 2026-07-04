import type { Models } from 'node-appwrite'

/**
 * Theme-Studio: eigene Schrift löschen — inkl. der Storage-Dateien
 * (best effort: verwaiste Dateien blockieren das Löschen der Row nicht).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing font id' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const row = await admin.tablesDB.getRow<Models.Row & { name?: string, files?: string | null }>({
    databaseId, tableId: 'custom_fonts', rowId: id,
  }).catch((error) => { throw toH3Error(error, 'Font not found') })

  // Storage-Dateien der Schrift miträumen
  try {
    const files = JSON.parse(row.files ?? '[]') as { fileId?: string }[]
    await Promise.all(files.map(file => file.fileId
      ? admin.storage.deleteFile({ bucketId: 'fonts', fileId: file.fileId }).catch(() => undefined)
      : undefined))
  }
  catch { /* kaputtes JSON — Row trotzdem löschen */ }

  await admin.tablesDB.deleteRow({ databaseId, tableId: 'custom_fonts', rowId: id })

  await recordAudit(event, { action: 'font.deleted', targetType: 'font', targetId: id, targetName: String(row.name ?? '') })
  return { ok: true }
})
