import { Query } from 'node-appwrite'
import type { StorageOverview } from '../../../shared/types/admin'

/**
 * Storage-Browser: Dateien des Avatars-Buckets + Orphan-Erkennung (von keinem
 * User-Profil referenziert). Braucht den files.read-Scope am Server-Key; fehlt
 * er (oder der Bucket), wird available:false zurückgegeben (UI zeigt Hinweis).
 */
export default defineEventHandler(async (event): Promise<StorageOverview> => {
  requirePermission(event, 'storage.manage')

  const config = useRuntimeConfig(event)
  const bucketId = config.public.appwriteAvatarsBucket

  if (!bucketId) {
    return { available: false, bucketId: '', files: [], totalBytes: 0, orphanCount: 0 }
  }

  const admin = createAdminClient(event)

  try {
    // Referenzierte fileIds → Account-Name aus den User-Profilen (prefs.avatarUrl).
    // ALLE User paginiert einsammeln: bei nur der ersten Seite würden Avatare von
    // Usern jenseits #100 fälschlich als „orphan" markiert — und der Bulk-Delete
    // („Verwaiste löschen") würde in Benutzung befindliche Dateien löschen.
    // Cursor- statt Offset-Pagination: bei parallelen Signups kann ein Offset
    // Rows überspringen — ein übersprungener User würde seinen Avatar fälschlich
    // als Orphan in den Bulk-Delete geben.
    const referenced = new Map<string, string>()
    const pattern = new RegExp(`/storage/${bucketId}/([^/?]+)`)
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

    // Dateien ebenfalls vollständig paginieren — sonst sind Liste, totalBytes und
    // orphanCount nur ein Ausschnitt der ersten 100.
    const files: StorageOverview['files'] = []
    let fileCursor: string | undefined
    for (;;) {
      const filesRes = await admin.storage.listFiles({
        bucketId,
        queries: [Query.orderDesc('$createdAt'), Query.limit(100), ...(fileCursor ? [Query.cursorAfter(fileCursor)] : [])],
      })
      for (const file of filesRes.files) {
        files.push({
          $id: file.$id,
          name: file.name,
          sizeBytes: file.sizeOriginal,
          mimeType: file.mimeType,
          $createdAt: file.$createdAt,
          orphan: !referenced.has(file.$id),
          linkedUserName: referenced.get(file.$id) ?? '',
        })
      }
      if (filesRes.files.length < 100) break
      fileCursor = filesRes.files.at(-1)!.$id
    }

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
