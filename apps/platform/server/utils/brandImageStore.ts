import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { renderBrandCardPng, type BrandCardInput } from '../../../../packages/themes/shared/brandCardPng'
import { renderBrandIconPng, type BrandIconInput } from '../../../../packages/themes/shared/brandIconPng'
import { BRAND_ICON_DEFAULT_SIZE } from '../../../../packages/themes/shared/brandIcon'

/**
 * Die Ablage der erzeugten Bildmarken-Bilder: Speicher → Platte → erst dann
 * rechnen. Zwei Sorten liegen darin — die Vorschau-Karte für geteilte Links
 * (`/og/<key>.png`) und das App-Icon für den Home-Bildschirm
 * (`/icon/<key>.png`).
 *
 * Der Punkt der ganzen Übung ist, dass DIESE Maschine so wenig wie möglich
 * tut. Ein Bild pro Community ändert sich fast nie (nur mit Theme oder Name),
 * also darf es auch nur so oft entstehen:
 *
 *  1. Prozess-Speicher — der Normalfall bei Crawler-Verkehr, 0 ms.
 *  2. Platte — überlebt Neustarts und Deploys (siehe Verzeichniswahl unten),
 *     also entsteht ein Bild in der Praxis EINMAL je Community.
 *  3. Rechnen — ~280 ms für die Karte, davon nur ~16 ms im Event-Loop (die
 *     Kompression läuft im Threadpool, pngEncode.ts). Das Icon ist mit
 *     512×512 rund ein Drittel der Fläche und entsprechend billiger.
 *
 * Warum kein `createMicrocache()` (core): der ist für kurzlebige JSON-Antworten
 * user-agnostischer GETs gedacht (10–60 s). Hier ist die Antwort ein
 * Binärpuffer, der Wochen gültig bleibt und den ein Neustart nicht verlieren
 * soll — das ist eine andere Sorte Cache.
 */

/**
 * Verzeichnis der Bilder. `tmpdir()` ist bewusst gewählt: Release-Slots
 * wechseln bei jedem Deploy den Pfad von `.output`, ein Cache DARIN wäre nach
 * jedem Deploy leer, und in das Release-Verzeichnis schreiben sollte ein
 * Server-Prozess ohnehin nicht. `/tmp` überlebt Deploys und wird von systemd
 * bei Bedarf aufgeräumt — schlimmster Fall ist ein neu gerechnetes Bild.
 * Override für abweichende Betriebsumgebungen: NUXT_BRAND_CARD_CACHE_DIR — der
 * Name stammt aus der Zeit, als nur die Karte hier lag, und bleibt: er steht
 * in Betriebsumgebungen und meint dasselbe Verzeichnis.
 */
const CACHE_DIR = process.env.NUXT_BRAND_CARD_CACHE_DIR || join(tmpdir(), 'pukalani-brand-cards')

/** Wenige Einträge genügen: ein Prozess bedient viele Hosts, aber Crawler
 *  kommen in Wellen pro Host. Deckel gegen unbegrenztes Wachstum. */
const MEMORY_LIMIT = 24
const memory = new Map<string, Buffer>()

function remember(name: string, png: Buffer): void {
  if (memory.size >= MEMORY_LIMIT) {
    const oldest = memory.keys().next().value
    if (oldest !== undefined) memory.delete(oldest)
  }
  memory.set(name, png)
}

/**
 * Ein Bild unter diesem Ablage-Namen — aus dem Speicher, von Platte, sonst
 * gerechnet. `name` ist der DATEINAME ohne Endung und muss jede Variante
 * unterscheiden (die beiden Icon-Größen tragen deshalb die Größe darin).
 */
async function cached(name: string, render: () => Promise<Buffer>): Promise<Buffer> {
  const hit = memory.get(name)
  if (hit) return hit

  const file = join(CACHE_DIR, `${name}.png`)
  const fromDisk = await readFile(file).catch(() => null)
  if (fromDisk) {
    remember(name, fromDisk)
    return fromDisk
  }

  const png = await render()
  remember(name, png)
  // Schreiben ist Beiwerk: schlägt es fehl (nur-lesbares /tmp, volle Platte),
  // bleibt das Bild im Speicher und die Antwort korrekt.
  await mkdir(CACHE_DIR, { recursive: true })
    .then(() => writeFile(file, png))
    .catch(() => undefined)
  return png
}

/**
 * Die Vorschau-Karte zu diesem Schlüssel — aus der Ablage oder neu gerechnet.
 *
 * @param key Cache-Schlüssel aus `brandCardKey()` (Farbe + Name + Design-Stand)
 * @param input Farbe, Community-Name, Wortmarke
 */
export async function brandCardPng(key: string, input: BrandCardInput): Promise<Buffer> {
  return cached(key, () => renderBrandCardPng(input))
}

/**
 * Das App-Icon zu diesem Schlüssel und dieser Größe.
 *
 * Der Ablage-Name trägt `icon-` als Präfix: Karten- und Icon-Schlüssel kommen
 * aus demselben Hash-Raum, könnten also zufällig gleich lauten — eine
 * WhatsApp-Karte als Home-Bildschirm-Icon wäre ein schwer zu findender Fehler.
 *
 * @param key Cache-Schlüssel aus `brandIconKey()` (Farbe + Name + Design-Stand)
 * @param input Farbe, Community-Name, Kantenlänge
 */
export async function brandIconPng(key: string, input: BrandIconInput): Promise<Buffer> {
  const size = input.size ?? BRAND_ICON_DEFAULT_SIZE
  return cached(`icon-${key}-${size}`, () => renderBrandIconPng(input))
}
