import type { Models } from 'node-appwrite'

/** Row-Typ zur `media_items`-Table (Schema: Migration media-001). */
export interface MediaItem extends Models.Row {
  title: string
  /** Kontextzeile unter dem Titel — bei Fotos z. B. der Aufnahmeort. */
  subtitle: string
  /** Alt-Text (a11y) — leer = Titel wird verwendet. */
  alt: string
  /** File-Id im Bucket 'media'. */
  fileId: string
  /** Layout-Hinweis der Site (z. B. breite Kachel im Galerie-Grid). */
  featured: boolean
  published: boolean
  sortOrder: number
  /**
   * KEIN `tenantId` mehr (F29, 2026-08-02): die Spalte ist mit media-005
   * gefallen, der Mandant heißt überall `communityId` (E8-3). Das Feld stand
   * hier noch als toter Rest — gelesen oder geschrieben wurde es nirgends, und
   * genau diese Drift zwischen Typ und Schema hat im events-Layer den Geldpfad
   * gebrochen (ein `tenantId` im Schreib-Objekt ⇒ 400 row_invalid_structure).
   * Die `communityId` steht bewusst NICHT im Typ: sie gehört der Datentür, die
   * sie stempelt und filtert — Produkt-Code liest sie nicht.
   */
}

/** Öffentlicher Listen-Eintrag — um die View-URL angereichert. */
export interface PublicMediaItem {
  id: string
  title: string
  subtitle: string
  alt: string
  featured: boolean
  /**
   * Skalierte Standard-Fassung (Bild-Naht, core/shared/storageImage) — und
   * zugleich die Eingabe für den @nuxt/image-Anbieter `appwrite` (C14), der
   * Bucket und Datei daraus liest und je Aufrufstelle neu rechnet.
   */
  src: string
}

/**
 * Verwaltungs-Form: die Row PLUS die vom Server gebaute Bild-URL. Vorher stand
 * `MediaItem & { src: string }` an drei Stellen in der Dashboard-Seite — beim
 * Ergänzen eines Feldes musste man alle drei finden. Ein Typ, ein Ort.
 */
export interface AdminMediaItem extends MediaItem {
  src: string
}

export const MEDIA_TABLE = 'media_items'
export const MEDIA_BUCKET = 'media'
export const MAX_MEDIA_BYTES = 15 * 1024 * 1024
