/**
 * Die Vorschau-Karte einer Community (og:image, 1200×630) — PURE Maße, Satz
 * und Cache-Schlüssel. Kein node:*, kein Nuxt: dieselben Funktionen laufen im
 * Browser (der Kopf braucht die URL) wie auf dem Server (der zeichnet).
 *
 * Warum es das gibt (OPEN-ITEMS B2): wer heute einen Link zu einer Community
 * teilt — WhatsApp, Slack, LinkedIn —, verschickt nackten Text. Geteilte Links
 * sind der billigste Weg, wie eine Community wächst, also ist das kein
 * Schönheitsfehler. Davids Entscheidung (2026-07-29): der Server erzeugt das
 * Bild aus dem, was ohnehin da ist — Basisfarbe des gewählten Themes,
 * Community-Name, dezente Wortmarke. Kein Upload-Feld (mögliche Ergänzung
 * später), und ausdrücklich NICHT ein einziges Pukalani-Bild für alle.
 *
 * Die Karte ist die große Schwester des Favicons (brandMark.ts) und teilt
 * dessen Bausteine: `resolveBrandColor` für die Farbe, `brandInkColor` für die
 * Tinte darauf. Gezeichnet wird in brandCardPng.ts (server-only).
 */

/** Ein Zeichen im gebackenen Atlas (scripts/generate-brand-card-font.mjs). */
export interface BrandCardGlyph {
  /** advance — Vorschub an der Grundlinie, in Atlas-Pixeln */
  a: number
  /** left — Versatz der Bitmap vom Stift */
  l: number
  /** top — Versatz der Bitmap von der Grundlinie (negativ = darüber) */
  t: number
  /** width der Deckungs-Bitmap (0 = Leerzeichen) */
  w: number
  /** height der Deckungs-Bitmap */
  h: number
  /** offset in den entpackten Pixel-Bytes */
  o: number
}

/** Der gebackene Zeichensatz — eine Größe, ein Gewicht, Deckung als Bytes. */
export interface BrandCardFont {
  /** Backgröße in Pixeln; größer wird NIE gezeichnet (nur verkleinert) */
  size: number
  ascent: number
  descent: number
  glyphs: Record<string, BrandCardGlyph>
  /** base64(gzip(Deckungs-Bytes aller Glyphen hintereinander)) */
  pixels: string
}

/** Standardmaß für Social-Vorschauen (1.91:1) — Facebook, X, LinkedIn, WhatsApp. */
export const BRAND_CARD_WIDTH = 1200
export const BRAND_CARD_HEIGHT = 630

/**
 * Gestaltungs-Stand. Fließt in den Cache-Schlüssel ein: wird die Karte
 * umgestaltet, ändern sich ALLE URLs und die Vorschau-Dienste holen neu.
 * Ohne diese Zahl zeigten WhatsApp & Co. das alte Bild bis in alle Ewigkeit
 * (die URLs sind `immutable` ausgeliefert).
 */
export const BRAND_CARD_VERSION = 1

/** Maße des Entwurfs — alles in Bildpunkten der 1200×630-Fläche. */
export const BRAND_CARD_LAYOUT = {
  pad: 80,
  /** Markenkreis oben links (wie das Favicon, nur groß) */
  markRadius: 44,
  /** Grundlinie der UNTERSTEN Titelzeile — der Satz wächst nach oben */
  titleBaseline: 424,
  titleSizes: [72, 64, 56, 48, 40],
  titleMaxLines: 2,
  /** Zeilenabstand als Faktor der Schriftgröße */
  titleLeading: 1.14,
  /** Kurzer Strich als Trennung zur Wortmarke */
  ruleY: 486,
  ruleWidth: 96,
  ruleHeight: 3,
  wordmarkSize: 26,
  wordmarkBaseline: 552,
  /** Sperrung der Wortmarke (Bildpunkte je Zeichenpaar) */
  wordmarkTracking: 2.4,
} as const

/** Länge, ab der ein Name gekappt wird — begrenzt den Satz-Aufwand. */
const MAX_NAME_CHARS = 96

/**
 * Was von einem Kundennamen übrig bleibt: Leerraum normalisiert, Zeichen ohne
 * gebackene Glyphe entfernt.
 *
 * Weglassen statt ersetzen ist Absicht: eine Reihe Kästchen („□□□") sieht nach
 * Fehler aus, ein fehlendes Sonderzeichen nach Schrift. Bleibt am Ende nichts
 * übrig (rein kyrillischer/japanischer Name), zeigt die Karte Farbe +
 * Wortmarke — immer noch eine Vorschau, nur ohne Namen.
 */
export function sanitizeBrandCardText(value: string, font: BrandCardFont): string {
  const kept: string[] = []
  for (const ch of value.normalize('NFC').slice(0, MAX_NAME_CHARS * 2)) {
    if (/\s/.test(ch)) {
      if (kept.length && kept[kept.length - 1] !== ' ') kept.push(' ')
      continue
    }
    if (font.glyphs[ch]) kept.push(ch)
  }
  return kept.join('').trim().slice(0, MAX_NAME_CHARS)
}

/** Breite einer Zeichenkette bei gegebener Schriftgröße (inkl. Sperrung). */
export function measureBrandCardText(
  text: string,
  font: BrandCardFont,
  size: number,
  tracking = 0,
): number {
  const scale = size / font.size
  const chars = [...text]
  let width = 0
  for (const ch of chars) width += (font.glyphs[ch]?.a ?? 0) * scale
  return width + Math.max(0, chars.length - 1) * tracking
}

/** Eine gesetzte Titelzeile. */
export interface BrandCardLine {
  text: string
  /** Grundlinie in Bildpunkten */
  baseline: number
}

export interface BrandCardTitle {
  size: number
  lines: BrandCardLine[]
}

/** Greedy-Umbruch auf höchstens `maxLines` Zeilen; null = passt nicht. */
function wrap(text: string, font: BrandCardFont, size: number, maxWidth: number, maxLines: number): string[] | null {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(' ')) {
    const candidate = current ? `${current} ${word}` : word
    if (measureBrandCardText(candidate, font, size) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    // Ein einzelnes Wort, das allein nicht passt, kann kein Umbruch retten
    if (measureBrandCardText(word, font, size) > maxWidth) return null
    current = word
    if (lines.length >= maxLines) return null
  }
  if (current) lines.push(current)
  return lines.length > 0 && lines.length <= maxLines ? lines : null
}

/** Zeichenweise kappen, bis der Rest mit „…" passt. */
function ellipsize(text: string, font: BrandCardFont, size: number, maxWidth: number): string {
  const chars = [...text]
  while (chars.length > 1) {
    chars.pop()
    const candidate = `${chars.join('').trimEnd()}…`
    if (measureBrandCardText(candidate, font, size) <= maxWidth) return candidate
  }
  return '…'
}

/**
 * Der Community-Name auf der Karte: so groß wie möglich, höchstens zwei
 * Zeilen, unten verankert (der Abstand zum Trennstrich bleibt konstant, egal
 * ob eine oder zwei Zeilen stehen).
 *
 * Erst die Größe herunterstufen, dann kappen — „Freundeskreis Alte Mühle
 * Wolfenbüttel" soll ganz dastehen, nur kleiner; abgeschnitten wird ein Name
 * erst, wenn selbst 40 px auf zwei Zeilen nicht reichen.
 */
export function layoutBrandCardTitle(name: string, font: BrandCardFont): BrandCardTitle {
  const { pad, titleBaseline, titleSizes, titleMaxLines, titleLeading } = BRAND_CARD_LAYOUT
  const maxWidth = BRAND_CARD_WIDTH - pad * 2
  const text = sanitizeBrandCardText(name, font)
  if (!text) return { size: titleSizes[0] as number, lines: [] }

  const place = (size: number, lines: string[]): BrandCardTitle => ({
    size,
    lines: lines.map((line, index) => ({
      text: line,
      baseline: titleBaseline - (lines.length - 1 - index) * Math.round(size * titleLeading),
    })),
  })

  for (const size of titleSizes) {
    const lines = wrap(text, font, size, maxWidth, titleMaxLines)
    if (lines) return place(size, lines)
  }

  // Notnagel: kleinste Größe, zwei Zeilen, zweite gekappt
  const size = titleSizes[titleSizes.length - 1] as number
  const words = text.split(' ')
  let first = ''
  let rest = text
  for (let i = words.length; i > 0; i--) {
    const candidate = words.slice(0, i).join(' ')
    if (measureBrandCardText(candidate, font, size) <= maxWidth) {
      first = candidate
      rest = words.slice(i).join(' ')
      break
    }
  }
  if (!first) {
    // Ein einziges überlanges Wort ohne Leerzeichen
    return place(size, [ellipsize(text, font, size, maxWidth)])
  }
  return place(size, rest ? [first, ellipsize(rest, font, size, maxWidth)] : [first])
}

/**
 * Cache-Schlüssel der Karte — er steckt in der og:image-URL
 * (`/og/<key>.png`).
 *
 * Warum überhaupt ein Schlüssel in der URL: Vorschau-Dienste merken sich ein
 * Bild PRO URL, oft für Wochen. Stellt eine Community ihr Theme um, muss sich
 * die URL ändern, sonst zeigt WhatsApp ewig die alte Farbe. Umgekehrt darf die
 * URL bei gleichem Inhalt NICHT wandern, sonst ist jeder geteilte Link ein
 * Cache-Fehlschlag.
 *
 * Bewusst eine 32-bit-FNV-1a und kein sha256: der Schlüssel muss auch im
 * Browser (Kopf-Plugin) berechenbar sein, dort gibt es kein synchrones
 * Hashing. Er ist ein Cache-Name, kein Geheimnis — Kollisionen kosten
 * schlimmstenfalls eine veraltete Vorschau, und die Route rendert ohnehin
 * immer den AKTUELLEN Stand.
 */
export function brandCardKey(...parts: (string | number | null | undefined)[]): string {
  const input = [BRAND_CARD_VERSION, ...parts].map(part => String(part ?? '')).join(' ')
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    // FNV-Primzahl 16777619 als Shift-Summe (bleibt in 32 bit ohne BigInt)
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0
  }
  return hash.toString(36).padStart(7, '0')
}

/** Pfad der Karte auf DIESEM Host — absolut macht ihn der Kopf (useLocaleSeoHead). */
export function brandCardPath(key: string): string {
  return `/og/${key}.png`
}

/** Erlaubte Schlüssel-Form in der Route (verhindert Pfad-Spielereien). */
export const BRAND_CARD_KEY_PATTERN = /^[0-9a-z]{5,12}$/
