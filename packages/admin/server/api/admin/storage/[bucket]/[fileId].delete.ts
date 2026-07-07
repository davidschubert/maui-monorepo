/**
 * Eine Storage-Datei löschen (Admin-Key, umgeht File-Permissions).
 * Bucket wird gegen die Instanz validiert; gdpr-exports ist gesperrt —
 * Snapshots haben ihre eigene Retention (30-Tage-Cleanup) und Admin-Seite.
 */
const READ_ONLY_BUCKETS = new Set(['gdpr-exports'])

export default defineEventHandler(async (event) => {
  requirePermission(event, 'storage.manage')

  const bucketId = getRouterParam(event, 'bucket')
  const fileId = getRouterParam(event, 'fileId')
  if (!bucketId || !fileId) {
    throw createError({ status: 400, statusText: 'Missing bucket or file id' })
  }
  if (READ_ONLY_BUCKETS.has(bucketId)) {
    throw createError({ status: 403, statusText: 'Bucket is read-only here' })
  }

  const admin = createAdminClient(event)
  // Existenz-Check statt Allowlist: nur echte Buckets der Instanz zulassen
  await admin.storage.getBucket({ bucketId })
    .catch((error) => { throw toH3Error(error, 'Bucket not found') })

  await admin.storage.deleteFile({ bucketId, fileId })
    .catch((error) => { throw toH3Error(error, 'File not found') })

  await recordAudit(event, { action: 'storage.file_deleted', targetType: 'file', targetId: fileId, targetName: bucketId })

  return { ok: true }
})
