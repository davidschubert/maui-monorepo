import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { renderBrandCardPng, type BrandCardInput } from '../../../../packages/themes/shared/brandCardPng'

/**
 * Die Ablage der Vorschau-Karten: Speicher → Platte → erst dann rechnen.
 *
 * Der Punkt der ganzen Übung ist, dass DIESE Maschine so wenig wie möglich
 * tut. Ein Bild pro Community ändert sich fast nie (nur mit Theme oder Name),
 * also darf es auch nur so oft entstehen:
 *
 *  1. Prozess-Speicher — der Normalfall bei Crawler-Verkehr, 0 ms.
 *  2. Platte — überlebt Neustarts und Deploys (siehe Verzeichniswahl unten),
 *     also entsteht ein Bild in der Praxis EINMAL je Community.
 *  3. Rechnen — ~280 ms, davon nur ~16 ms im Event-Loop (die Kompression
 *     läuft im Threadpool, pngEncode.ts).
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
 * Override für abweichende Betriebsumgebungen: NUXT_BRAND_CARD_CACHE_DIR.
 */
const CACHE_DIR = process.env.NUXT_BRAND_CARD_CACHE_DIR || join(tmpdir(), 'pukalani-brand-cards')

/** Wenige Einträge genügen: ein Prozess bedient viele Hosts, aber Crawler
 *  kommen in Wellen pro Host. Deckel gegen unbegrenztes Wachstum. */
const MEMORY_LIMIT = 24
const memory = new Map<string, Buffer>()

function remember(key: string, png: Buffer): void {
  if (memory.size >= MEMORY_LIMIT) {
    const oldest = memory.keys().next().value
    if (oldest !== undefined) memory.delete(oldest)
  }
  memory.set(key, png)
}

/**
 * Die Karte zu diesem Schlüssel — aus der Ablage oder neu gerechnet.
 *
 * @param key Cache-Schlüssel aus `brandCardKey()` (Farbe + Name + Design-Stand)
 * @param input Farbe, Community-Name, Wortmarke
 */
export async function brandCardPng(key: string, input: BrandCardInput): Promise<Buffer> {
  const hit = memory.get(key)
  if (hit) return hit

  const file = join(CACHE_DIR, `${key}.png`)
  const fromDisk = await readFile(file).catch(() => null)
  if (fromDisk) {
    remember(key, fromDisk)
    return fromDisk
  }

  const png = await renderBrandCardPng(input)
  remember(key, png)
  // Schreiben ist Beiwerk: schlägt es fehl (nur-lesbares /tmp, volle Platte),
  // bleibt die Karte im Speicher und die Antwort korrekt.
  await mkdir(CACHE_DIR, { recursive: true })
    .then(() => writeFile(file, png))
    .catch(() => undefined)
  return png
}
