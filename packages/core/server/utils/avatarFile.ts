/**
 * fileId aus einer Storage-Avatar-URL (/api/storage/<bucket>/<id>?…), sonst
 * null. Eine Quelle für zwei Nutzer: profile.put (Alt-Avatar ersetzen) und
 * die GDPR-Löschung (Avatar-Datei entfernen).
 */
export function avatarFileId(url: unknown, bucketId: string): string | null {
  if (typeof url !== 'string' || !bucketId) return null
  const match = url.match(/^\/api\/storage\/([^/]+)\/([^/?]+)/)
  return match && match[1] === bucketId ? match[2]! : null
}
