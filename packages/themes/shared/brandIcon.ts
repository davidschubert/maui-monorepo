/**
 * Das App-Icon einer Community — PURE Maße, Größen und Cache-Schlüssel. Kein
 * node:*, kein Nuxt: dieselben Funktionen laufen im Browser (der Kopf braucht
 * die URL) wie auf dem Server (der zeichnet).
 *
 * Warum es das gibt (OPEN-ITEMS C7, Rest aus Pool-Audit K2): legt jemand eine
 * Community auf den Home-Bildschirm — und genau das tun Mitglieder einer
 * Community, die sie täglich benutzen —, dann entscheidet `apple-touch-icon`,
 * was dort steht. Ohne dieses Icon nimmt iOS einen Screenshot der Seite: ein
 * graues, unlesbares Kachelbild. Android/Chrome nehmen zwar auch ein
 * SVG-Favicon, aber eben nur, wenn es keins in PNG gibt.
 *
 * PNG-PFLICHT, deshalb ein eigenes Bild neben `/favicon.svg`: iOS akzeptiert
 * als `apple-touch-icon` ausschließlich Bitmaps. Aus dem SVG der Bildmarke
 * lässt sich das nicht ableiten, ohne einen Renderer im Betrieb zu haben —
 * gezeichnet wird es deshalb aus denselben Bausteinen wie die Vorschau-Karte
 * (brandIconPng.ts, gebackener Zeichensatz).
 */
import { brandMarkKey } from './brandCard'

/**
 * Gestaltungs-Stand des Icons. Fließt in den Schlüssel ein — wird das Icon
 * umgestaltet, wandern alle URLs und die Geräte holen neu. BEWUSST getrennt
 * von BRAND_CARD_VERSION: die beiden Bilder werden nicht zusammen umgestaltet,
 * und eine gemeinsame Zahl würde jedes Mal auch das andere Bild neu ausliefern.
 */
export const BRAND_ICON_VERSION = 1

/**
 * Die zwei Größen, mehr braucht es nicht.
 *
 * 180 ist das Maß, das iOS seit dem iPhone 6 Plus für `apple-touch-icon` will
 * (kleinere Geräte skalieren herunter — Apple empfiehlt ausdrücklich EIN
 * großes statt eines Dutzends). 512 ist die Größe, die Android/Chrome für den
 * Home-Bildschirm und PWA-Installationen erwarten. Alles dazwischen wäre
 * Ablage-Aufwand ohne Empfänger.
 *
 * Die Liste ist zugleich die ERLAUBNIS der Route: jede andere Zahl wird
 * abgewiesen. Ohne diesen Riegel könnte ein Bot mit `?size=9999` beliebig groß
 * rechnen lassen und die Ablage füllen.
 */
export const BRAND_ICON_SIZES = [180, 512] as const
export type BrandIconSize = typeof BRAND_ICON_SIZES[number]

/** Voreinstellung ohne `?size` — die größere, weil sie überall herunterskaliert. */
export const BRAND_ICON_DEFAULT_SIZE: BrandIconSize = 512
/** Was iOS als `apple-touch-icon` bekommt. */
export const BRAND_ICON_TOUCH_SIZE: BrandIconSize = 180

/** Ist das eine ausgelieferte Größe? (Route und Kopf fragen dieselbe Stelle.) */
export function isBrandIconSize(value: unknown): value is BrandIconSize {
  return BRAND_ICON_SIZES.includes(Number(value) as BrandIconSize)
}

/**
 * SCHRIFTGRÖSSE der Initiale als Anteil der Kantenlänge (die sichtbare
 * Versalhöhe liegt bei rund 70 % davon, also ~42 % der Kachel).
 *
 * Größer sieht beschnitten aus: iOS rundet die Ecken der Kachel selbst und
 * nimmt dabei sichtbar Fläche weg; kleiner verliert der Buchstabe auf einem
 * Home-Bildschirm neben zwei Dutzend anderen Icons seine Erkennbarkeit.
 */
export const BRAND_ICON_GLYPH_RATIO = 0.6

/**
 * Cache-Schlüssel des Icons — er steckt in der URL (`/icon/<key>.png`), aus
 * demselben Grund wie bei der Vorschau-Karte: Geräte und Zwischenspeicher
 * merken sich ein Icon pro URL, oft dauerhaft. Ändert die Community ihre
 * Farbe, muss die URL wandern; bleibt sie gleich, darf sie es nicht.
 *
 * Die GRÖSSE steckt bewusst NICHT im Schlüssel: 180 und 512 zeigen dasselbe
 * Bild in zwei Auflösungen, und ein gemeinsamer Schlüssel macht im Kopf aus
 * zwei Zeilen zwei Zeilen mit derselben Zahl darin — leichter zu lesen. In der
 * ABLAGE werden sie getrennt (Dateiname key + Größe).
 *
 * Das führende 'icon' ist kein Schmuck: ohne es liefert derselbe Hash bei
 * gleichem Gestaltungs-Stand denselben Schlüssel wie die Vorschau-Karte, und
 * die beiden Versionszahlen wären nur scheinbar unabhängig — ein Bump auf der
 * einen Seite ließe die andere URL zufällig mitwandern oder eben nicht.
 */
export function brandIconKey(color: string, name: string): string {
  return brandMarkKey('icon', BRAND_ICON_VERSION, color, name)
}

/** Pfad des Icons auf DIESEM Host (relativ — der Kopf verlinkt ihn so). */
export function brandIconPath(key: string, size: BrandIconSize = BRAND_ICON_DEFAULT_SIZE): string {
  return size === BRAND_ICON_DEFAULT_SIZE ? `/icon/${key}.png` : `/icon/${key}.png?size=${size}`
}

/** Erlaubte Schlüssel-Form in der Route (verhindert Pfad-Spielereien). */
export const BRAND_ICON_KEY_PATTERN = /^[0-9a-z]{5,12}$/
