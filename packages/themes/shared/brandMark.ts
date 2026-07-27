import { hexToRgb } from './ramp'

/**
 * Die Bildmarke einer Community: gefüllter Kreis in der Primärfarbe des
 * Mandanten-Themes + Initial des Community-Namens (Audit-Befund K2).
 *
 * Warum es das gibt: Mandanten-Hosts lieferten bis 2026-07-27 Nitros
 * 78-Byte-Platzhalter-Favicon aus — im Tab, im Lesezeichen und in der
 * Verlaufsliste sah jede Community aus wie „irgendeine Seite". Ein eigenes
 * Bild pro Kunde hochzuladen ist Onboarding-Arbeit, die niemand macht; aus
 * Farbe + Initial lässt sich dagegen OHNE Zutun etwas Erkennbares erzeugen.
 *
 * Pur und ohne Nuxt-/Layer-Abhängigkeit (deshalb shared/, unit-getestet):
 * dieselben Funktionen bedienen die Server-Route `/favicon.svg` der
 * Platform-App UND — über resolveBrandColor — das `theme-color`-Meta im Head,
 * damit Tab-Icon und Browser-Einfärbung nie auseinanderlaufen.
 */

/** Ein Theme, so weit die Bildmarke es braucht (Built-in wie Custom). */
export interface BrandThemeEntry {
  id: string
  color: string
  variants?: readonly { id: string, color: string }[]
}

/** Farbe des Core-Default-Themes — greift, wenn nichts anderes auflösbar ist. */
export const BRAND_MARK_FALLBACK_COLOR = '#737373'

/** Weiße Schrift auf der Marke; nur sehr helle Basisfarben bekommen dunkle Tinte. */
const BRAND_INK_LIGHT = '#ffffff'
const BRAND_INK_DARK = '#1c1917'

/**
 * Die Markenfarbe einer Community: das VOREINGESTELLTE Theme des Mandanten,
 * nicht die persönliche Theme-Wahl des Besuchers.
 *
 * Bewusst so (Design-Default, Davids Veto): Favicon und `theme-color` sind
 * Identität der Community, kein Anzeige-Setting — sie sollen für alle Besucher
 * gleich aussehen und öffentlich cachebar bleiben. `defaultThemeId`/
 * `defaultVariantId` tragen bereits die Mandanten-Wahl: `/api/themes`
 * überschreibt die Instanz-Einstellung mit `tenants.theme/variant` (O5).
 *
 * @param themes Built-ins + Custom Themes (dieselbe Liste wie im Picker)
 * @param themeId `defaultThemeId` (Built-in-Id oder 'c-<rowId>')
 * @param variantId `defaultVariantId` — nur gültig, wenn das Theme sie kennt
 */
export function resolveBrandColor(
  themes: readonly BrandThemeEntry[],
  themeId?: string | null,
  variantId?: string | null,
): string {
  const theme = themes.find(entry => entry.id === themeId)
  if (!theme) return themes.find(entry => entry.id === 'default')?.color ?? BRAND_MARK_FALLBACK_COLOR
  const variant = variantId ? theme.variants?.find(entry => entry.id === variantId) : undefined
  return variant?.color ?? theme.color ?? BRAND_MARK_FALLBACK_COLOR
}

/**
 * Tinte auf der Marke: Weiß, außer die Basisfarbe ist so hell, dass Weiß darauf
 * verschwindet (Citrus/Honey & Co. sind gelb-hell). Die Vorgabe „Initial in
 * Weiß" bleibt der Normalfall — ohne diese Ausnahme wäre das Favicon auf den
 * hellen Themes des 26er-Katalogs schlicht leer.
 *
 * Maß ist die relative Leuchtdichte nach WCAG; die Schwelle 0.45 hält bei allen
 * Katalog-Farben mindestens ~3:1 Kontrast.
 */
export function brandInkColor(background: string): string {
  const rgb = hexToRgb(background)
  if (!rgb) return BRAND_INK_LIGHT
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.45 ? BRAND_INK_DARK : BRAND_INK_LIGHT
}

/** XML-Escaping für den Text im SVG — der Name kommt aus Kundendaten. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Die Bildmarke als SVG (skaliert von 16 px im Tab bis zur Kachel).
 *
 * Ein Zeichen ist Absicht: zwei Initialen sind bei 16 px Kantenlänge nicht mehr
 * lesbar. Wer den Text bestimmt, entscheidet der Aufrufer (core `avatarInitials`
 * liefert bis zu zwei — davon nimmt die Marke das erste Zeichen).
 * Leerer Text = reiner Farbkreis (besser als ein Kasten mit Kästchen-Glyphe).
 *
 * `font-family` bewusst generisch: das SVG wird vom Browser-Chrome gerendert,
 * wo weder die Theme-Schrift noch ein Webfont zur Verfügung steht.
 */
export function brandFaviconSvg(color: string, initial: string): string {
  const glyph = [...initial.trim()][0] ?? ''
  const ink = brandInkColor(color)
  const text = glyph
    ? `<text x="32" y="33" fill="${ink}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="36" font-weight="600" text-anchor="middle" dominant-baseline="central">${escapeXml(glyph)}</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img"><circle cx="32" cy="32" r="32" fill="${color}"/>${text}</svg>`
}
