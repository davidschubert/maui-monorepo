import { Query } from 'node-appwrite'

/**
 * GDPR-Snapshots listen (Admin). Ruft dabei den Lazy-Cleanup: Dateien älter
 * als die Aufbewahrungsfrist (30 Tage) werden bei jedem Aufruf entfernt —
 * jeder Admin-Kontakt mit dem Feature garantiert so die Frist (Plan §4.8).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.manage')

  const config = useRuntimeConfig(event)
  const bucketId = config.public.appwriteGdprBucket
  if (!bucketId) return { total: 0, files: [] }

  await cleanupExpiredGdprExports(event).catch(() => {})

  const admin = createAdminClient(event)
  const res = await admin.storage.listFiles({
    bucketId,
    queries: [Query.orderDesc('$createdAt'), Query.limit(100)],
  }).catch((error) => { throw toH3Error(error, 'Could not list exports') })

  return {
    total: res.total,
    files: res.files.map(f => ({
      $id: f.$id,
      name: f.name,
      sizeOriginal: f.sizeOriginal,
      $createdAt: f.$createdAt,
    })),
  }
})
