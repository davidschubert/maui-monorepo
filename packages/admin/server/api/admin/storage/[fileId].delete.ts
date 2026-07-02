/** Eine Storage-Datei löschen (Admin-Key, umgeht File-Permissions). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'storage.manage')

  const fileId = getRouterParam(event, 'fileId')
  if (!fileId) {
    throw createError({ status: 400, statusText: 'Missing file id' })
  }

  const config = useRuntimeConfig(event)
  const bucketId = config.public.appwriteAvatarsBucket
  if (!bucketId) {
    throw createError({ status: 400, statusText: 'No bucket configured' })
  }

  const admin = createAdminClient(event)
  await admin.storage.deleteFile({ bucketId, fileId })
    .catch((error) => { throw toH3Error(error, 'File not found') })

  await recordAudit(event, { action: 'storage.file_deleted', targetType: 'file', targetId: fileId })

  return { ok: true }
})
