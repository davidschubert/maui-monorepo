/**
 * Bild-URLs aus dem Appwrite-Storage — EINE Stelle, die entscheidet, in
 * welcher Größe ein Bild ausgeliefert wird.
 *
 * WARUM ES DAS GIBT: bis 2026-07-28 baute jeder Konsument seine URL selbst
 * zusammen (media, event-covers …) und nahm dabei immer `/view` — also die
 * ORIGINALDATEI. Ein 4000-Pixel-Foto ging damit unverkleinert aufs Handy,
 * obwohl Appwrite seit Langem `/preview` mit width/height/quality/output
 * anbietet und die Ergebnisse selbst cacht. Das war kein Bug in einer Datei,
 * sondern eine fehlende Naht: fünf Stellen, die sich alle an dasselbe
 * erinnern mussten.
 *
 * Die Funktionen hier sind REIN (kein h3, kein Nuxt) und damit testbar; die
 * Konsumenten reichen Endpoint + Projekt-Id aus der runtimeConfig herein.
 *
 * ABGRENZUNG: nur für BILDER. Schriften (Bucket 'fonts') müssen weiterhin über
 * `/view` laufen — eine WOFF2 durch den Bild-Transformer zu schicken ergibt
 * keine Datei, die ein Browser laden kann.
 *
 * Berechtigungen bleiben unberührt: `/preview` prüft dieselben Rechte wie
 * `/view`. Veröffentlichte Dateien mit read(any) sind öffentlich abrufbar,
 * geschützte Entwürfe (media-002, fileSecurity) brauchen die Session — im
 * Dashboard trägt der Browser sie ohnehin mit.
 */

/** Instanz-Koordinaten — kommen aus `config.public` des jeweiligen Layers. */
export interface StorageBase {
  endpoint: string
  projectId: string
}

/**
 * Appwrite deckelt Vorschau-Kanten bei 4000 px. Größere Werte beantwortet die
 * API mit 400 statt mit einem kleineren Bild — deshalb klemmen wir selbst,
 * damit ein versehentliches `width: 6000` nicht die Galerie leer lässt.
 */
export const STORAGE_PREVIEW_MAX_EDGE = 4000

export interface StorageImageOptions {
  /** Zielbreite in CSS-Pixeln (vor DPR-Multiplikation durch den Aufrufer). */
  width?: number
  /** Zielhöhe; ohne Angabe skaliert Appwrite proportional zur Breite. */
  height?: number
  /** 0–100. Ohne Angabe entscheidet Appwrite (aktuell 100 = unnötig groß). */
  quality?: number
  /**
   * Ausgabeformat. 'webp' ist die sichere Wahl für Fotos (alle Zielbrowser
   * dieses Projekts können es); AVIF spart mehr, kostet beim Erzeugen aber
   * deutlich mehr CPU — und die läuft auf DERSELBEN Maschine wie die sieben
   * Apps. Deshalb kein AVIF-Default, sondern eine bewusste Entscheidung.
   */
  output?: 'webp' | 'jpg' | 'jpeg' | 'png' | 'gif' | 'avif'
}

function clampEdge(value: number): number {
  const rounded = Math.round(value)
  if (!Number.isFinite(rounded) || rounded <= 0) return 0
  return Math.min(rounded, STORAGE_PREVIEW_MAX_EDGE)
}

/**
 * Original-URL einer Datei (`/view`) — unverändert, unskaliert.
 * Für Downloads, Schriften und alles, was byte-genau bleiben muss.
 */
export function storageFileUrl(base: StorageBase, bucketId: string, fileId: string): string {
  return `${base.endpoint}/storage/buckets/${bucketId}/files/${fileId}/view?project=${base.projectId}`
}

/**
 * Bild-URL in der gewünschten Größe. OHNE Optionen fällt sie bewusst auf die
 * Original-URL zurück — so bleibt ein Aufrufer, der noch keine Größe kennt,
 * exakt beim alten Verhalten statt versehentlich ein transformiertes Bild zu
 * bekommen.
 */
export function storageImageUrl(
  base: StorageBase,
  bucketId: string,
  fileId: string,
  options: StorageImageOptions = {},
): string {
  const width = options.width === undefined ? 0 : clampEdge(options.width)
  const height = options.height === undefined ? 0 : clampEdge(options.height)
  const hasSize = width > 0 || height > 0
  const hasFormat = options.output !== undefined
  const hasQuality = options.quality !== undefined

  if (!hasSize && !hasFormat && !hasQuality) {
    return storageFileUrl(base, bucketId, fileId)
  }

  const params = new URLSearchParams()
  if (width > 0) params.set('width', String(width))
  if (height > 0) params.set('height', String(height))
  if (hasQuality) {
    const q = Math.round(options.quality as number)
    params.set('quality', String(Math.min(100, Math.max(0, q))))
  }
  if (options.output) params.set('output', options.output)
  // project MUSS mit — Appwrite ordnet den Request sonst keinem Projekt zu.
  params.set('project', base.projectId)

  return `${base.endpoint}/storage/buckets/${bucketId}/files/${fileId}/preview?${params.toString()}`
}

/**
 * Kandidatenliste für ein `srcset`: dieselbe Datei in mehreren Breiten.
 * Vorbereitung für Schritt 2 (`@nuxt/image` mit eigenem Appwrite-Provider) —
 * schon jetzt nutzbar, wo ein Bild in stark unterschiedlichen Größen erscheint.
 */
export function storageImageSrcset(
  base: StorageBase,
  bucketId: string,
  fileId: string,
  widths: number[],
  options: Omit<StorageImageOptions, 'width'> = {},
): string {
  return widths
    .map(w => clampEdge(w))
    .filter(w => w > 0)
    .sort((a, b) => a - b)
    .filter((w, i, all) => all.indexOf(w) === i)
    .map(w => `${storageImageUrl(base, bucketId, fileId, { ...options, width: w })} ${w}w`)
    .join(', ')
}
