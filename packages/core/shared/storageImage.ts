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

/**
 * Was Appwrite 1.9.6 als `output` annimmt — 2026-07-31 gegen die lokale Instanz
 * nachgemessen (jedes Format 200 + passender Content-Type; ein unbekannter Wert
 * antwortet 400 und nennt genau diese Liste).
 */
export const STORAGE_PREVIEW_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'avif', 'gif'] as const
export type StoragePreviewFormat = typeof STORAGE_PREVIEW_FORMATS[number]

/**
 * DER DEFAULT IST WEBP, NICHT AVIF (C14, Messung 2026-07-31).
 *
 * Gemessen wurde beides: die Transformation in Appwrite (Imagick) und — als
 * Vergleichsmaßstab — dieselbe Arbeit mit sharp/libvips, also dem, was `ipx`
 * unter @nuxt/image auf dem APP-Server tun würde.
 *  - sharp: AVIF kostet je nach Größe das 3- bis 24-Fache an CPU (bis 2,3
 *    CPU-Sekunden für EIN 1280-px-Bild auf einem M1 Max). Auf dem geteilten
 *    CX23/CX33 neben sieben Apps ist das nicht vertretbar.
 *  - Appwrite: der Aufpreis ist milder (1,0–3,0× Wanduhr) und wird gecacht
 *    (zweiter Abruf ~5 ms) — aber der BYTE-Gewinn trägt ihn nicht: bei gleicher
 *    `quality` war AVIF nur unterhalb ~q60 kleiner (10–40 %) und ab q78 sogar
 *    GRÖSSER als WebP.
 * Also: WebP als Default, AVIF bleibt möglich (`format="avif"` je Aufrufstelle),
 * aber niemand bezahlt es unbemerkt. Zahlen: docs/OPEN-ITEMS.md → C14.
 */
export const STORAGE_PREVIEW_DEFAULT_FORMAT: StoragePreviewFormat = 'webp'

/**
 * Qualität, wenn niemand eine nennt. 78 ist der Wert, den die Bild-Naht seit
 * Schritt 1 an allen Aufrufstellen benutzt — hier festgehalten, damit der
 * @nuxt/image-Anbieter nicht seine eigene Zahl erfindet.
 */
export const STORAGE_PREVIEW_DEFAULT_QUALITY = 78

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
  output?: StoragePreviewFormat
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

/* -------------------------------------------------------------------------- *
 * Schritt 2 (C14): der reine Kern des @nuxt/image-Anbieters `appwrite`.
 *
 * Der Anbieter (core/app/providers/appwrite.ts) besteht nur noch aus dem Aufruf
 * von `storageProviderImageUrl`. Er hat BEWUSST keinerlei Nuxt-Abhängigkeit —
 * weder `#imports` noch `useRuntimeConfig`, obwohl der Endpoint dort läge.
 *
 * WARUM DAS WICHTIG IST (einmal teuer gelernt): @nuxt/image legt für jeden
 * eigenen Anbieter eine Typ-Vorlage an und referenziert sie mit
 * `{ nitro, nuxt, node, shared }` — also in ALLEN VIER generierten tsconfigs.
 * Darüber landet die Anbieter-Datei auch im node- und im shared-Projekt, und
 * dort gibt es weder `#imports` noch die App-Auto-Imports. Ein `#imports` in der
 * Anbieter-Datei kostete deshalb 188 Typfehler quer durch alle Layer, von denen
 * nur EINER auf die Anbieter-Datei zeigte. Ein Anbieter darf nur importieren,
 * was in jedem der vier Projekte existiert.
 *
 * Der Ausweg ist zugleich die einfachere Bauart: die URL, die `<NuxtImg>`
 * bekommt, ENTHÄLT den Endpoint und das Projekt schon — die Bild-Naht aus
 * Schritt 1 baut sie so. Der Anbieter braucht also gar keine Konfiguration, er
 * rechnet eine vorhandene Storage-URL in eine andere Größe um.
 * -------------------------------------------------------------------------- */

/** Alles, was in einer Storage-URL steckt: Instanz, Projekt, Bucket, Datei. */
export interface ParsedStorageImage extends StorageBase {
  bucketId: string
  fileId: string
}

/**
 * Zerlegt eine Appwrite-Storage-URL — und lässt alles andere in Ruhe.
 *
 * Erkannt wird, was `storageFileUrl`/`storageImageUrl` erzeugen:
 * `<endpoint>/storage/buckets/<bucket>/files/<datei>/(view|preview|download)?…project=<id>`
 *
 * `project` ist PFLICHT, nicht Kosmetik: ohne es ordnet Appwrite den Abruf
 * keinem Projekt zu. Fehlt es, gibt es hier `null` — dann reicht der Anbieter
 * die URL unverändert durch, statt eine kaputte zu bauen.
 *
 * Alles andere (statische Bilder, fremde CDNs, data:-URIs) ergibt ebenfalls
 * `null`. Genau deshalb darf der Anbieter global als Default eingestellt sein.
 */
export function parseStorageImageUrl(src: string): ParsedStorageImage | null {
  if (typeof src !== 'string') return null
  const trimmed = src.trim()
  if (!trimmed) return null

  const match = /^(.*?)\/storage\/buckets\/([^/?#]+)\/files\/([^/?#]+)\/(?:view|preview|download)(?:[/?#]|$)/
    .exec(trimmed)
  if (!match) return null
  const [, endpoint, bucketId, fileId] = match
  if (!endpoint || !bucketId || !fileId) return null

  const query = trimmed.slice(trimmed.indexOf('?') + 1)
  const projectId = trimmed.includes('?')
    ? new URLSearchParams(query).get('project') ?? ''
    : ''
  if (!projectId) return null

  return {
    endpoint,
    projectId,
    bucketId: safeDecode(bucketId),
    fileId: safeDecode(fileId),
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  }
  catch {
    return value
  }
}

/**
 * Die Modifier, die @nuxt/image an einen Anbieter reicht. Bewusst weit
 * getippt (`number | string`), weil `width`/`height` aus einem Template auch
 * als String ankommen können.
 */
export interface StorageProviderModifiers {
  width?: number | string
  height?: number | string
  quality?: number | string
  format?: string
}

function toNumber(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Rechnet eine Appwrite-Storage-URL in die von @nuxt/image verlangte Größe um.
 *
 * Zwei bewusste Festlegungen:
 *  - OHNE `format` wird WebP geliefert, nie AVIF (Begründung + Messung an
 *    STORAGE_PREVIEW_DEFAULT_FORMAT).
 *  - Ein Format, das Appwrite nicht kennt, wird IGNORIERT statt durchgereicht:
 *    ein durchgereichtes `output=jxl` beantwortet Appwrite mit 400, und eine
 *    leere Galerie ist der schlechtere Fehler als ein WebP zu viel.
 *
 * Nicht abgebildete Modifier (`fit`, `blur`, `background`) fallen weg —
 * `/preview` kennt sie nicht. Für `blur` heißt das konkret: der
 * `placeholder`-Modus von `<NuxtImg>` liefert ein winziges, hochskaliertes
 * Bild statt eines weichgezeichneten. Das ist der LQIP, den wir wollen.
 */
export function storageProviderImageUrl(
  src: string,
  modifiers: StorageProviderModifiers = {},
): string {
  const parsed = parseStorageImageUrl(src)
  if (!parsed) return src

  const format = typeof modifiers.format === 'string' ? modifiers.format.toLowerCase() : ''
  const output = (STORAGE_PREVIEW_FORMATS as readonly string[]).includes(format)
    ? format as StoragePreviewFormat
    : STORAGE_PREVIEW_DEFAULT_FORMAT

  const quality = toNumber(modifiers.quality) ?? STORAGE_PREVIEW_DEFAULT_QUALITY
  const width = toNumber(modifiers.width)
  const height = toNumber(modifiers.height)

  return storageImageUrl(
    { endpoint: parsed.endpoint, projectId: parsed.projectId },
    parsed.bucketId,
    parsed.fileId,
    {
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      quality,
      output,
    },
  )
}
