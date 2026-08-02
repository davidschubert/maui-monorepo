import { storageFileUrl, storageImageUrl, type StorageImageOptions } from '../../../core/shared/storageImage'

/** Bucket der Cover-Bilder (events-002) — an EINER Stelle, nicht je Aufruf. */
const COVER_BUCKET = 'event-covers'

/**
 * Cover-Bilder im Bucket 'event-covers' — der Browser lädt direkt vom
 * Appwrite-Endpoint.
 *
 * NUR FÜR SICHTBARE TERMINE (seit events-009 + F28): der Bucket ist ein
 * fileSecurity-Bucket, und eine Cover-Datei trägt exakt die READ-Permissions
 * ihrer Row. Für einen veröffentlichten Termin ist das `read(any)` bzw. in
 * einer geschlossenen Community `read(label:<communityId>)` — beides holt der
 * Browser des Betrachters selbst. Für einen ENTWURF ist es NICHTS; dessen
 * Vorschau läuft über `GET /api/events/:id/cover` (Dashboard), nicht über
 * diese URLs. Wer hier eine Entwurfs-Datei einsetzt, bekommt ein 404-Bild —
 * und das ist die richtige Antwort, kein Fehler.
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
     *
     * Für `<img>`-Stellen, og:image und Tests. Wer `<NuxtImg>` benutzt, nimmt
     * `coverSource` — dort entscheidet der Browser die Größe.
     */
    coverUrl: (fileId: string, options: StorageImageOptions = {}) =>
      storageImageUrl(base(), COVER_BUCKET, fileId, {
        width: 800,
        quality: 78,
        output: 'webp',
        ...options,
      }),
    /**
     * Dieselbe Datei als EINGABE für `<NuxtImg provider="appwrite">`
     * (Bild-Naht Schritt 2, C14).
     *
     * Bewusst OHNE Größe: der Anbieter liest aus dieser URL nur Instanz,
     * Projekt, Bucket und Datei und rechnet jede Fassung selbst aus. Eine
     * Größe hier wäre irreführend — sie käme nie beim Browser an. Ausgeliefert
     * wird trotzdem NIE das Original: der Anbieter setzt immer mindestens
     * Format und Qualität, die URL wird also immer zu `/preview`.
     */
    coverSource: (fileId: string) => storageFileUrl(base(), COVER_BUCKET, fileId),
    /** Unveränderte Originaldatei — für Download oder Weiterverarbeitung. */
    coverOriginalUrl: (fileId: string) => storageFileUrl(base(), COVER_BUCKET, fileId),
  }
}
