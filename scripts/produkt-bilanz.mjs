#!/usr/bin/env node
/**
 * PRODUKT-BILANZ ERZEUGEN — „ein Konzept pro Produkt", aus dem CODE gerechnet.
 *
 *   node scripts/produkt-bilanz.mjs            # schreibt docs/referenz/PRODUKT-BILANZ.md
 *   node scripts/produkt-bilanz.mjs --check    # CI-Gate: Neuerzeugen darf kein Diff geben
 *
 * WARUM ES DIESES SKRIPT GIBT (Paritäts-Audit 2026-08-02): die Bilanz war ein
 * von Hand gepflegtes Dokument und nach fünf Wochen zu 7 von 12 Zeilen falsch —
 * events/courses standen als „nicht montiert", obwohl sie im Pool laufen,
 * tickets/feedback als „Silo-only", obwohl sie nach control gezogen sind, media
 * als „eingefroren", obwohl es pool-fertig ist. Ausgerechnet das Dokument, auf
 * dem die Zusage „Pool zeigt dasselbe wie Silo" ruht, führte damit in die Irre.
 *
 * Ein Dokument, das man pflegen MUSS, veraltet. Dieses hier wird gerechnet:
 * die Manifeste sagen, was es gibt und wer es montiert; die Dateien sagen, ob
 * ein Layer durch die Mandanten-Tür geht und ob eine App eine Layer-Seite
 * überschreibt. Was sich nicht messen lässt, steht bewusst NICHT drin — dafür
 * gibt es das Archiv-Dokument, auf das der Kopf verweist.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/referenz/PRODUKT-BILANZ.md')
const check = process.argv.includes('--check')

const dirs = parent => readdirSync(join(ROOT, parent), { withFileTypes: true })
  .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
  .map(entry => entry.name)

/** Alle Dateien unter `rel` (rekursiv), als Pfade RELATIV zu `rel`. */
function walk(rel, base = rel) {
  const abs = join(ROOT, rel)
  if (!existsSync(abs)) return []
  return readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return []
    const next = `${rel}/${entry.name}`
    return entry.isDirectory() ? walk(next, base) : [next.slice(base.length + 1)]
  })
}

// ── Manifeste: WAS es gibt und WER es montiert ──────────────────────────────
const layers = dirs('packages')
const apps = dirs('apps')

const productManifest = {}
for (const layer of layers) {
  const file = join(ROOT, `packages/${layer}/product.manifest.ts`)
  productManifest[layer] = existsSync(file) ? (await import(pathToFileURL(file).href)).default : null
}
const siteManifest = {}
for (const app of apps) {
  const file = join(ROOT, `apps/${app}/site.manifest.ts`)
  siteManifest[app] = existsSync(file) ? (await import(pathToFileURL(file).href)).default : null
}

/** Apps, die einen Layer montieren (transitiv über `requires` ist Sache von
 *  check-manifests — hier zählt die ausdrückliche Wahl im Site-Manifest). */
const mountedIn = layer => apps.filter(app => siteManifest[app]?.products?.includes(layer))

// ── Datentür: geht der Layer in `server/api/**` durch `tenantDb`? ───────────
function dataDoor(layer) {
  const files = walk(`packages/${layer}/server/api`).filter(f => f.endsWith('.ts'))
  if (!files.length) return { total: 0, door: 0, raw: 0 }
  let door = 0
  let raw = 0
  for (const rel of files) {
    const src = readFileSync(join(ROOT, `packages/${layer}/server/api`, rel), 'utf8')
    if (src.includes('tenantDb(')) door++
    // Rohes tablesDB der Client-Fabriken — der ESLint-Backstop verbietet genau das.
    if (/\.tablesDB\b/.test(src) || /\btablesDB\s*[,}]/.test(src)) raw++
  }
  return { total: files.length, door, raw }
}

/** Trägt das Datenmodell des Layers eine Mandanten-Spalte? */
function tenantColumn(layer) {
  const files = walk(`packages/${layer}/scripts/migrations`).filter(f => f.endsWith('.ts'))
  return files.some(rel => readFileSync(join(ROOT, `packages/${layer}/scripts/migrations`, rel), 'utf8').includes('communityId'))
}

// ── Tarif-Gate im Pool (apps/platform: pukalani.tenancy.products) ───────────
function planGates() {
  const src = readFileSync(join(ROOT, 'apps/platform/app/app.config.ts'), 'utf8')
  const block = src.match(/\n\s*products:\s*\{([\s\S]*?)\n\s*\},/)
  if (!block) return {}
  const gates = {}
  for (const line of block[1].split('\n')) {
    const hit = line.match(/^\s*'?([a-z]+)'?:\s*'([a-z]+)'/)
    if (hit) gates[hit[1]] = hit[2]
  }
  return gates
}

// ── „Einmal?": überschreibt eine App eine Seite ihrer Layer? ────────────────
const routeOf = rel => '/' + rel.replace(/\.vue$/, '').replace(/\/index$/, '')

function pageRoutes(base) {
  return new Map(walk(`${base}/app/pages`).filter(f => f.endsWith('.vue')).map(rel => [routeOf(rel), rel]))
}

const layerRoutes = Object.fromEntries(layers.map(layer => [layer, pageRoutes(`packages/${layer}`)]))

/** App-Seiten, die eine gleichnamige Seite eines montierten Layers verdecken. */
function appOverrides(app) {
  const own = pageRoutes(`apps/${app}`)
  const products = siteManifest[app]?.products ?? []
  const hits = []
  for (const [route] of own) {
    const from = products.filter(layer => layerRoutes[layer]?.has(route))
    if (from.length) hits.push({ route, from })
  }
  return hits
}

/** Kompositionen des Bauplans: welche Produkt-Seite überlagert er? */
function blueprintCompositions() {
  return [...layerRoutes.blueprint.keys()].map((route) => {
    const covers = layers.filter(layer => layer !== 'blueprint' && layerRoutes[layer]?.has(route))
    return { route, covers }
  }).filter(entry => entry.covers.length)
}

// ── Bericht ────────────────────────────────────────────────────────────────
const gates = planGates()
const POOL_APP = 'platform'
const yes = '✅'
const no = '—'

const rows = layers
  .filter(layer => productManifest[layer]?.tier === 'optional')
  .sort()
  .map((layer) => {
    const mounted = mountedIn(layer)
    const door = dataDoor(layer)
    return {
      layer,
      mounted,
      pool: mounted.includes(POOL_APP),
      silos: mounted.filter(app => app !== POOL_APP),
      door,
      tenantColumn: tenantColumn(layer),
      gate: gates[layer],
    }
  })

const foundation = layers.filter(layer => productManifest[layer]?.tier === 'foundation').sort()

const matrixApps = apps.filter(app => (siteManifest[app]?.products?.length ?? 0) > 0).sort()

const lines = []
const p = line => lines.push(line)

p('<!-- ERZEUGT von scripts/produkt-bilanz.mjs — NICHT von Hand bearbeiten. -->')
p('<!-- Neu erzeugen: node scripts/produkt-bilanz.mjs · Prüfen: --check -->')
p('')
p('# Produkt-Bilanz')
p('')
p('Beantwortet Davids Leitfrage „ein Produkt hat genau EIN Konzept, der Aufbau')
p('ist überall derselbe" — **gerechnet aus dem Code**, nicht aus Erinnerung.')
p('Quellen: `apps/*/site.manifest.ts`, `packages/*/product.manifest.ts`, die')
p('Dateien unter `server/api/**` und `app/pages/**`, das Tarif-Gate in')
p('`apps/platform/app/app.config.ts`.')
p('')
p('Die ursprüngliche Bilanz vom 2026-07-27 (Begründung, warum es')
p('`packages/blueprint` gibt, samt der verworfenen Alternativen) liegt als')
p('Protokoll in [`docs/archiv/PRODUKT-BILANZ-2026-07-27.md`](../archiv/PRODUKT-BILANZ-2026-07-27.md).')
p('')
p('## Produkte')
p('')
p('| Produkt | Pool (`platform`) | Silo-Apps | Datentür (`server/api`) | Mandanten-Spalte | Tarif ab |')
p('| --- | --- | --- | --- | --- | --- |')
for (const row of rows) {
  const doorCell = row.door.total === 0
    ? 'keine eigenen Routen'
    : `${row.door.door}/${row.door.total} über \`tenantDb\`${row.door.raw ? ` · ${row.door.raw} roh` : ''}`
  p(`| **${row.layer}** | ${row.pool ? yes : no} | ${row.silos.length ? row.silos.join(', ') : no} | ${doorCell} | ${row.tenantColumn ? yes : no} | ${row.gate ?? no} |`)
}
p('')
p('Lesehilfe: „Datentür" zählt die Route-Dateien, die `tenantDb(event)` nutzen —')
p('„roh" wären Dateien mit direktem `tablesDB`, die der ESLint-Backstop in')
p('gepoolten Layern verbietet. „Mandanten-Spalte" heißt: die Migrationen des')
p('Layers legen `communityId` an. Ein Layer ohne eigene Routen (z. B. `feedback`)')
p('holt seine Daten über die Naht eines anderen Layers.')
p('')
p('## Fundament (kein Kundenprodukt)')
p('')
p(foundation.map(layer => `\`${layer}\``).join(' · '))
p('')
p('## Welche App montiert was')
p('')
p(`| Produkt | ${matrixApps.join(' | ')} |`)
p(`| --- | ${matrixApps.map(() => '---').join(' | ')} |`)
for (const layer of layers.slice().sort()) {
  if (!mountedIn(layer).length) continue
  p(`| \`${layer}\` | ${matrixApps.map(app => (siteManifest[app].products.includes(layer) ? yes : no)).join(' | ')} |`)
}
p('')
p('## Der Bauplan: wo Pool und Silo dasselbe zeigen')
p('')
p('`packages/blueprint` ist der einzige Layer, der mehrere Produkt-Layer kennen')
p('darf. Seine Seiten überlagern die „nackten" Produktseiten — jede App, die ihn')
p('extended, zeigt dasselbe Produktverhalten.')
p('')
const comps = blueprintCompositions()
if (comps.length) {
  p('| Route | überlagert Seite aus |')
  p('| --- | --- |')
  for (const entry of comps) p(`| \`${entry.route}\` | ${entry.covers.map(l => `\`${l}\``).join(', ')} |`)
}
else {
  p('_Keine überlagernden Seiten gefunden._')
}
p('')
p('Montiert in: ' + (mountedIn('blueprint').map(a => `\`${a}\``).join(', ') || '—') + '.')
p('')
p('## App-Seiten, die eine Layer-Seite verdecken')
p('')
p('Jeder Eintrag hier ist eine Ausprägung, die es nur in DIESER App gibt — genau')
p('die Drift, die „ein Konzept pro Produkt" verhindern soll. Leer ist gut.')
p('')
const overrides = matrixApps.flatMap(app => appOverrides(app).map(hit => ({ app, ...hit })))
if (overrides.length) {
  p('| App | Route | verdeckt Layer |')
  p('| --- | --- | --- |')
  for (const hit of overrides) p(`| \`${hit.app}\` | \`${hit.route}\` | ${hit.from.map(l => `\`${l}\``).join(', ')} |`)
}
else {
  p('_Keine._')
}
p('')

const report = lines.join('\n')

if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  if (current !== report) {
    console.error('✗ docs/referenz/PRODUKT-BILANZ.md ist nicht mehr das, was der Code sagt.')
    console.error('  Neu erzeugen: node scripts/produkt-bilanz.mjs')
    process.exit(1)
  }
  console.log('✔ Produkt-Bilanz deckt sich mit dem Code.')
}
else {
  writeFileSync(OUT, report)
  console.log(`✔ ${OUT} erzeugt (${rows.length} Produkte, ${matrixApps.length} Apps).`)
}
