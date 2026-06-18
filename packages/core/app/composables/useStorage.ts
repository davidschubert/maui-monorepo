import type { Models } from 'node-appwrite'

/**
 * Appwrite Storage via Server Routes — kein Web-SDK-CRUD im Browser.
 * Der Bucket gehört der App; das Composable wird pro Bucket instanziiert.
 */
export function useStorage(bucketId: string) {
  async function upload(file: File): Promise<Models.File> {
    const body = new FormData()
    body.append('file', file)
    return await $fetch<Models.File>(`/api/storage/${bucketId}`, { method: 'POST', body })
  }

  /**
   * URL für <img>/Downloads — der Server streamt mit korrektem Content-Type.
   * Mit width/height/quality liefert der Server eine optimierte, zugeschnittene
   * WebP-Preview (Appwrite getFilePreview) statt der Originaldatei.
   */
  function fileUrl(fileId: string, options?: { width?: number, height?: number, quality?: number }): string {
    const base = `/api/storage/${bucketId}/${fileId}`
    if (!options) return base
    const params = new URLSearchParams()
    if (options.width) params.set('w', String(options.width))
    if (options.height) params.set('h', String(options.height))
    if (options.quality) params.set('q', String(options.quality))
    const query = params.toString()
    return query ? `${base}?${query}` : base
  }

  async function remove(fileId: string): Promise<void> {
    await $fetch(`/api/storage/${bucketId}/${fileId}`, { method: 'DELETE' })
  }

  return { upload, fileUrl, remove }
}
