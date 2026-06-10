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

  /** URL für <img>/Downloads — der Server streamt mit korrektem Content-Type */
  function fileUrl(fileId: string): string {
    return `/api/storage/${bucketId}/${fileId}`
  }

  async function remove(fileId: string): Promise<void> {
    await $fetch(`/api/storage/${bucketId}/${fileId}`, { method: 'DELETE' })
  }

  return { upload, fileUrl, remove }
}
