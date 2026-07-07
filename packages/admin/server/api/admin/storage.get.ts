import { Query } from 'node-appwrite'
import type { StorageBucketOverview, StorageFileEntry, StorageOverview } from '../../../shared/types/admin'

/** gdpr-exports hat eigene Retention (30 Tage) + Admin-Seite → hier read-only */
const READ_ONLY_BUCKETS = new Set(['gdpr-exports'])

/**
 * Storage-Browser über ALLE Buckets des Projekts (buckets.read am Runtime-Key).
 * Avatars-Bucket zusätzlich mit Orphan-Erkennung (von keinem User-Profil
 * referenziert). Fehlt ein Scope, wird available:false zurückgegeben
 * (UI zeigt Konfigurationshinweis).
 */
export default defineEventHandler(async (event): Promise<StorageOverview> => {
  requirePermission(event, 'storage.manage')

  const config = useRuntimeConfig(event)
  const avatarsBucket = config.public.appwriteAvatarsBucket
  const admin = createAdminClient(event)

  try {
    // Referenzierte Avatar-fileIds → Account-Name aus den User-Profilen
    // (prefs.avatarUrl). ALLE User per Cursor einsammeln: eine unvollständige
    // Menge würde in Benutzung befindliche Avatare fälschlich als „orphan"
    // markieren — und der Bulk-Delete würde sie löschen.
    const referenced = new Map<string, string>()
    if (avatarsBucket) {
      const pattern = new RegExp(`/storage/${avatarsBucket}/([^/?]+)`)
      let userCursor: string | undefined
      for (;;) {
        const usersRes = await admin.users.list({
          queries: [Query.limit(100), ...(userCursor ? [Query.cursorAfter(userCursor)] : [])],
        })
        for (const user of usersRes.users) {
          const url = (user.prefs as { avatarUrl?: string })?.avatarUrl
          const match = typeof url === 'string' ? url.match(pattern) : null
          if (match) referenced.set(match[1]!, user.name || user.email)
        }
        if (usersRes.users.length < 100) break
        userCursor = usersRes.users.at(-1)!.$id
      }
    }

    const bucketsRes = await admin.storage.listBuckets({ queries: [Query.limit(100)] })

    const buckets: StorageBucketOverview[] = []
    for (const bucket of bucketsRes.buckets) {
      const orphanAware = bucket.$id === avatarsBucket

      // Dateien vollständig paginieren — sonst sind Liste, totalBytes und
      // orphanCount nur ein Ausschnitt der ersten 100.
      const files: StorageFileEntry[] = []
      let fileCursor: string | undefined
      for (;;) {
        const filesRes = await admin.storage.listFiles({
          bucketId: bucket.$id,
          queries: [Query.orderDesc('$createdAt'), Query.limit(100), ...(fileCursor ? [Query.cursorAfter(fileCursor)] : [])],
        })
        for (const file of filesRes.files) {
          files.push({
            $id: file.$id,
            name: file.name,
            sizeBytes: file.sizeOriginal,
            mimeType: file.mimeType,
            $createdAt: file.$createdAt,
            orphan: orphanAware && !referenced.has(file.$id),
            linkedUserName: referenced.get(file.$id) ?? '',
          })
        }
        if (filesRes.files.length < 100) break
        fileCursor = filesRes.files.at(-1)!.$id
      }

      buckets.push({
        id: bucket.$id,
        name: bucket.name,
        files,
        totalBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
        orphanCount: orphanAware ? files.filter(f => f.orphan).length : 0,
        orphanAware,
        readOnly: READ_ONLY_BUCKETS.has(bucket.$id),
      })
    }

    return { available: true, buckets }
  }
  catch {
    // Meist fehlender buckets.read-/files.read-Scope am Key → UI zeigt Hinweis
    return { available: false, buckets: [] }
  }
})
