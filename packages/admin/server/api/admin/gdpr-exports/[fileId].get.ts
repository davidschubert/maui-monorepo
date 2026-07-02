/** GDPR-Snapshot herunterladen (Admin) + Audit. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.manage')

  const fileId = getRouterParam(event, 'fileId')
  if (!fileId) {
    throw createError({ status: 400, statusText: 'Missing file id' })
  }

  const config = useRuntimeConfig(event)
  const bucketId = config.public.appwriteGdprBucket
  if (!bucketId) {
    throw createError({ status: 404, statusText: 'No GDPR bucket configured' })
  }

  const admin = createAdminClient(event)
  const meta = await admin.storage.getFile({ bucketId, fileId })
    .catch((error) => { throw toH3Error(error, 'Export not found') })
  const data = await admin.storage.getFileDownload({ bucketId, fileId })
    .catch((error) => { throw toH3Error(error, 'Export not found') })

  await recordAudit(event, { action: 'gdpr_export.downloaded', targetType: 'file', targetId: fileId, targetName: meta.name })

  setHeader(event, 'Content-Type', 'application/json')
  setHeader(event, 'Content-Disposition', `attachment; filename="${meta.name.replace(/[^\w.-]/g, '_')}"`)
  // Das SDK parst application/json-Dateien bereits ins Objekt — je nach Typ
  // re-serialisieren statt Buffer.from(objekt) (würde werfen).
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (typeof data === 'string') return data
  return JSON.stringify(data, null, 2)
})
