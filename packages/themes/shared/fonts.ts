/**
 * Individuelle Schriftarten (Theme-Studio): Typen + Runtime-CSS-Generator.
 *
 * Hochgeladene Fonts (nur WOFF2, Storage-Bucket 'fonts') können nicht über
 * @nuxt/fonts laufen (das self-hostet nur BUILD-bekannte Familien) — ihre
 * @font-face-Regeln werden deshalb zur Laufzeit in den SSR-Head gerendert,
 * exakt wie das Custom-Theme-CSS. Pure Funktionen, unit-getestet.
 */

/** Eine Datei einer Schriftfamilie: Gewicht + Storage-Datei */
export interface CustomFontFile {
  /** 100–900 (Vielfache von 100); bei variable die Default-Achse egal */
  weight: number
  /** Appwrite-Storage-fileId im Bucket 'fonts' */
  fileId: string
  /** true = Variable Font (deckt font-weight 100–900 ab) */
  variable?: boolean
}

export interface CustomFontDto {
  /** Appwrite-Row-ID (data-font wird `cf-<id>`) */
  id: string
  name: string
  order: number
  files: CustomFontFile[]
}

/** data-font-Attributwert einer eigenen Schrift (kollidiert nie mit Registry-Paaren) */
export function customFontAttr(id: string): string {
  return `cf-${id}`
}

/**
 * Defense-in-Depth am Render-Sink: dieses CSS landet im Head ALLER Besucher
 * (auch Gäste). Die Write-Boundary (admin: fonts/index.post.ts +
 * fonts/[id].patch.ts) erzwingt dieselben Allowlists per Zod — hier
 * gespiegelt (admin darf nicht aus themes importieren, ESLint-Backstop),
 * damit ein Writer, der an den Admin-Routen vorbeischreibt (Seed, Console,
 * künftige Routen), keine CSS-/</style>-Injection bekommt. Verletzer werden
 * NICHT gerendert (fail closed). Änderungen hier + im admin-Schema synchron halten.
 */
const SAFE_FONT_NAME = /^[a-z0-9][a-z0-9 _-]{0,63}$/i
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,35}$/i // Appwrite-Row-/File-ID-Form

/**
 * CSS einer eigenen Schrift: @font-face je Datei + beide Rollen-Blöcke —
 * data-font (Text: --font-sans + font-family am :root) und data-font-heading
 * (Überschriften: h1–h6), gleiche Struktur wie fonts.css für die Registry-
 * Familien. Name/IDs laufen zusätzlich durch die SAFE_*-Spiegel-Allowlists
 * (s. o.); fileUrl baut der Aufrufer aus Endpoint/Projekt.
 */
export function customFontCss(font: CustomFontDto, fileUrl: (fileId: string) => string): string {
  if (!SAFE_FONT_NAME.test(font.name) || !SAFE_ID.test(font.id)) return ''
  const files = font.files.filter(file => SAFE_ID.test(file.fileId)
    && Number.isInteger(file.weight) && file.weight >= 100 && file.weight <= 900)
  if (!files.length) return ''
  const faces = files.map(file => `@font-face {
  font-family: '${font.name}';
  src: url('${fileUrl(file.fileId)}') format('woff2');
  font-weight: ${file.variable ? '100 900' : file.weight};
  font-style: normal;
  font-display: swap;
}`)
  const attr = customFontAttr(font.id)
  const stack = `'${font.name}', ui-sans-serif, system-ui, sans-serif`
  const textBlock = `:root[data-font='${attr}'] {\n  --font-sans: ${stack};\n  font-family: ${stack};\n}`
  const headingSelectors = [1, 2, 3, 4, 5, 6].map(level => `:root[data-font-heading='${attr}'] h${level}`).join(',\n')
  const headingBlock = `${headingSelectors} {\n  font-family: ${stack};\n}`
  return [...faces, textBlock, headingBlock].join('\n')
}
