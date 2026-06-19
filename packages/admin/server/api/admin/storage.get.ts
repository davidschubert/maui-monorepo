import { Query } from 'node-appwrite'
import type { StorageOverview } from '../../../shared/types/admin'

/**
 * Storage-Browser: Dateien des Avatars-Buckets + Orphan-Erkennung (von keinem
 * User-Profil referenziert). Braucht den files.read-Scope am Server-Key; fehlt
 * er (oder der Bucket), wird available:false zurückgegeben (UI zeigt Hinweis).
 */
export default defineEventHandler(async (event): Promise<StorageOverview> => {
  requireAdmin(event)

  const config = useRuntimeConfig(event)
  const bucketId = config.public.appwriteAvatarsBucket

  if (!bucketId) {
    return { available: false, bucketId: '', files: [], totalBytes: 0, orphanCount: 0 }
  }

  const admin = createAdminClient(event)

  try {
    // Referenzierte fileIds aus den User-Profilen (prefs.avatarUrl)
    const referenced = new Set<string>()
    const pattern = new RegExp(`/storage/${bucketId}/([^/?]+)`)
    const usersRes = await admin.users.list({ queries: [Query.limit(100)] })
    for (const user of usersRes.users) {
      const url = (user.prefs as { avatarUrl?: string })?.avatarUrl
      const match = typeof url === 'string' ? url.match(pattern) : null
      if (match) referenced.add(match[1]!)
    }

    const filesRes = await admin.storage.listFiles({
      bucketId,
      queries: [Query.orderDesc('$createdAt'), Query.limit(100)],
    })

    const files = filesRes.files.map(file => ({
      $id: file.$id,
      name: file.name,
      sizeBytes: file.sizeOriginal,
      mimeType: file.mimeType,
      $createdAt: file.$createdAt,
      orphan: !referenced.has(file.$id),
    }))

    return {
      available: true,
      bucketId,
      files,
      totalBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
      orphanCount: files.filter(f => f.orphan).length,
    }
  }
  catch {
    // Meist fehlender files.read-Scope am Key → UI zeigt Konfigurationshinweis
    return { available: false, bucketId, files: [], totalBytes: 0, orphanCount: 0 }
  }
})
