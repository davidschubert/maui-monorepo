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
 * CSS einer eigenen Schrift: @font-face je Datei + data-font-Block (setzt
 * --font-sans UND font-family am :root, wie fonts.css für die Registry-Paare;
 * eigene Schriften gelten für Text und Überschriften gleichermaßen).
 * Name/IDs sind Zod-validiert (keine Quotes/Sonderzeichen) — keine
 * Injection-Fläche; fileUrl baut der Aufrufer aus Endpoint/Projekt.
 */
export function customFontCss(font: CustomFontDto, fileUrl: (fileId: string) => string): string {
  if (!font.files.length) return ''
  const faces = font.files.map(file => `@font-face {
  font-family: '${font.name}';
  src: url('${fileUrl(file.fileId)}') format('woff2');
  font-weight: ${file.variable ? '100 900' : file.weight};
  font-style: normal;
  font-display: swap;
}`)
  const stack = `'${font.name}', ui-sans-serif, system-ui, sans-serif`
  const block = `:root[data-font='${customFontAttr(font.id)}'] {\n  --font-sans: ${stack};\n  font-family: ${stack};\n}`
  return [...faces, block].join('\n')
}
