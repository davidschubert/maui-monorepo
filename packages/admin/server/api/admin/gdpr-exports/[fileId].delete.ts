/** GDPR-Snapshot manuell löschen (Admin) + Audit. */
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
  await admin.storage.deleteFile({ bucketId, fileId })
    .catch((error) => { throw toH3Error(error, 'Export not found') })

  await recordAudit(event, { action: 'gdpr_export.deleted', targetType: 'file', targetId: fileId })

  return { ok: true }
})
