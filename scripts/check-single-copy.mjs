/**
 * Wächter gegen DOPPELTE Kernabhängigkeiten im Baum.
 *
 * Warum es das gibt: zwei Kopien derselben Kernabhängigkeit sind in diesem
 * Repo zweimal teuer geworden, und beide Male sah der Lockfile harmlos aus.
 *  - vue 3.5.39 + 3.5.40 (2026-07-30): der Nitro-Externals-Tracer lief im
 *    Zyklus vue → @vue/server-renderer → vue, der Prod-Build starb an
 *    ENAMETOOLONG.
 *  - h3 1.15.11 + 2.0.1-rc.26 (2026-07-30): pnpm hoistet EINE der beiden nach
 *    `.pnpm/node_modules/h3`, `nuxi prepare` schreibt genau die in die `paths`
 *    der generierten tsconfigs, nitros eigene Typen bleiben bei h3 1 — gewinnt
 *    h3 2, ist jedes an einen Helfer weitergereichte Event ein Typfehler
 *    (platform 1102, control 944, comments 1261). Welche gewinnt, steht NICHT
 *    im Lockfile: dieselbe Lockfile war auf einer Maschine grün, auf der
 *    anderen rot.
 *
 * Der Lockfile ist die Quelle — nicht node_modules: hier soll auch auffallen,
 * was ein Bump EINBAUT, bevor jemand installiert. Geprüft wird nur die Liste
 * unten; alles andere darf mehrfach vorkommen (esbuild, oxc-parser & Co. tun
 * das dauerhaft und harmlos).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Pakete, bei denen ZWEI Versionen im Baum bekanntermaßen etwas kaputt machen:
 * geteilte Typen (h3, unhead), geteilte Laufzeit-Identität (vue, vue-router,
 * pinia) oder der Build selbst (nuxt, nitropack, vite).
 */
const SINGLE_COPY = [
  'vue',
  'vue-router',
  'h3',
  'nuxt',
  'nitropack',
  'unhead',
  '@unhead/vue',
  'pinia',
  'vite',
  // Seit 2026-08-05 hängt `packages/posts` DIREKT an
  // `@tiptap/extension-mention` (Namensvervollständigung im Beitrags-Editor),
  // während `@nuxt/ui` seinen ganzen Tiptap-Satz als optionalen Peer
  // mitbringt. Tiptap erkennt eine Extension nur, wenn sie gegen DIESELBE
  // `@tiptap/core`-Instanz gebaut ist. Zwei Kopien heißen hier: der eigene
  // `renderMarkdown`-Handler greift nicht mehr, und der Mention-Knoten
  // serialisiert wieder zu `[@ id="…" label="…"]` — mitten in den Beitrag.
  // Das wäre ein STILLER Datenfehler, kein Build-Fehler, und genau deshalb
  // steht der Name hier.
  '@tiptap/core',
]

/**
 * Bewusst hingenommene Doppelungen — mit Grund und Ablaufbedingung, damit sie
 * sichtbar bleiben statt aus der Liste zu verschwinden.
 */
const ACCEPTED = {
  // Nuxt 4.5.1 steht auf unhead 3, @nuxt/ui 4.10.0 (die NEUESTE) haengt noch
  // an @unhead/vue 2 — die aktuelle Paarung laesst sich nicht aufloesen.
  // Vertretbar, weil die TYP-Seite nicht am Hoisting haengt: `nuxi prepare`
  // schreibt `@unhead/vue` explizit auf 3.2.3 in die `paths`. Belegt ist es
  // ausserdem am Ergebnis — der SSR-Head ist ueber 8 Proben byte-gleich.
  // Faellt weg, sobald @nuxt/ui auf unhead 3 geht.
  'unhead': ['2.1.15', '3.2.3'],
  '@unhead/vue': ['2.1.15', '3.2.3'],
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')

/**
 * Versionen aus den Paket-Schlüsseln des `packages:`-Blocks (`  name@version:`).
 *
 * DAS ANFÜHRUNGSZEICHEN IST PFLICHT, NICHT KOSMETIK (2026-08-05 gefunden):
 * YAML darf einen Schlüssel nicht mit `@` beginnen lassen, also schreibt pnpm
 * jedes GESCOPTE Paket gequotet — `  '@unhead/vue@3.2.3':` statt
 * `  vue@3.5.40:`. Ohne das optionale `'` traf diese Regel kein einziges
 * scoped Paket: `@unhead/vue` stand seit seiner Aufnahme in SINGLE_COPY, fand
 * IMMER die leere Liste und war damit ein Wächter, der nicht wachen kann —
 * `versions.length <= 1` überspringt ihn, der Lauf meldet grün, und die
 * daneben gepflegte ACCEPTED-Ausnahme war ebenfalls tot. Genau die Sorte
 * Fehler, die dieses Skript verhindern soll.
 *
 * Das abschließende `:` gehört mit in die Regel: ohne es würde die Version
 * auch aus einer VERWEIS-Zeile gelesen (`      '@tiptap/core': 3.27.1(…)`),
 * und der Wächter meldete Doppelungen, die es nicht gibt.
 */
function versionsOf(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^ {2}'?${escaped}@([^(:\\s]+?)'?:`, 'gm')
  return [...new Set([...lock.matchAll(re)].map(m => m[1]))].sort()
}

const offenders = []
const accepted = []
for (const name of SINGLE_COPY) {
  const versions = versionsOf(name)
  if (versions.length <= 1) continue
  // Nur GENAU die dokumentierte Paarung gilt als hingenommen — kommt eine
  // dritte Version dazu oder wandert eine weiter, meldet sich der Wächter.
  const ok = ACCEPTED[name]
  if (ok && ok.length === versions.length && ok.every((v, i) => v === versions[i])) {
    accepted.push({ name, versions })
    continue
  }
  offenders.push({ name, versions })
}

if (offenders.length > 0) {
  console.error('✖ Doppelte Kernabhängigkeit im Lockfile:\n')
  for (const { name, versions } of offenders) {
    console.error(`  ${name}: ${versions.join(', ')}`)
  }
  console.error(`
Zwei Kopien einer dieser Abhängigkeiten brechen Typen oder Build — und WELCHE
gewinnt, entscheidet pnpms Hoisting, nicht der Lockfile. Derselbe Lockfile ist
damit auf einer Maschine grün und auf der anderen rot.

Beheben, nicht umgehen: die Quelle der zweiten Kopie finden
(\`grep -n "<paket>: <version>" pnpm-lock.yaml\`) und entweder den Katalog
nachziehen (wenn eine Kernabhängigkeit eine neuere Version verlangt) oder in
pnpm-workspace.yaml \`overrides\` auf EINE Linie zwingen.`)
  process.exit(1)
}

for (const { name, versions } of accepted) {
  console.log(`• hingenommen: ${name} ${versions.join(' + ')} (Grund in scripts/check-single-copy.mjs)`)
}
console.log(`✔ Einzelkopie-Check: ${SINGLE_COPY.length} Kernabhängigkeiten geprüft, keine ungeklärte Doppelung`)
