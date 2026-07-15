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
}

/** Öffentlicher Listen-Eintrag — um die View-URL angereichert. */
export interface PublicMediaItem {
  id: string
  title: string
  subtitle: string
  alt: string
  featured: boolean
  src: string
}

export const MEDIA_TABLE = 'media_items'
export const MEDIA_BUCKET = 'media'
export const MAX_MEDIA_BYTES = 15 * 1024 * 1024
