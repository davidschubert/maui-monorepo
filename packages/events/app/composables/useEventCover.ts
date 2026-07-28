import { storageFileUrl, storageImageUrl, type StorageImageOptions } from '../../../core/shared/storageImage'

/**
 * Cover-Bilder im Bucket 'event-covers' (Migration events-002) — Dateien sind
 * read(any), der Browser lädt direkt vom Appwrite-Endpoint.
 *
 * Seit 2026-07-28 über die zentrale Bild-Naht (core/shared/storageImage):
 * `coverUrl` liefert eine SKALIERTE Fassung. Vorher ging hier die
 * Originaldatei über die Leitung — bei einem Handy-Foto also mehrere Megabyte
 * für ein Vorschaubild, das im Layout ein paar hundert Pixel breit ist.
 */
export function useEventCover() {
  const config = useRuntimeConfig()
  const base = () => ({
    endpoint: config.public.appwriteEndpoint,
    projectId: config.public.appwriteProjectId,
  })

  return {
    /**
     * Skaliertes Cover. Default 800 px + WebP bei Qualität 78 — deckt Listen-
     * und Detailansicht auch auf Retina-Displays ab, ohne je Aufrufstelle eine
     * eigene Größe zu erfinden. Wer es anders braucht, übergibt es.
     */
    coverUrl: (fileId: string, options: StorageImageOptions = {}) =>
      storageImageUrl(base(), 'event-covers', fileId, {
        width: 800,
        quality: 78,
        output: 'webp',
        ...options,
      }),
    /** Unveränderte Originaldatei — für Download oder Weiterverarbeitung. */
    coverOriginalUrl: (fileId: string) => storageFileUrl(base(), 'event-covers', fileId),
  }
}
