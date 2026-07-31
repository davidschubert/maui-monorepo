/**
 * Migration control-024: `feature` → `product` im Control Plane, ADDITIV.
 *
 * Davids Auftrag 2026-07-30: ein Wort je Sache — im Code UND in Appwrite.
 * Diese Migration ist der ERSTE von drei Schritten (Ausdehnen → Umziehen →
 * Zusammenziehen) und legt ausschließlich NEUES an. Nach ihr existiert alles
 * doppelt, der laufende Code merkt nichts.
 *
 * WARUM DIE MIGRATION VOR DEM CODE KOMMT (der eigentliche Grund für dieses
 * Vorgehen): `featureKey` ist nicht bloß ein TypeScript-Bezeichner, sondern
 * zugleich der APPWRITE-SPALTENSCHLÜSSEL. In scripts/control-jobs.mjs steht
 * `data: { siteProjectId, featureKey, … }` — die Objekt-Eigenschaft IST der
 * Spaltenname. Hätte man erst den Code umbenannt, schriebe er ab dem Deploy
 * gegen Spalten, die es nicht gibt: still, mitten im Produkt- und Geldpfad.
 *
 * DIE ROW-ID IST HIER DER PRODUKT-SCHLÜSSEL. `control-jobs.mjs` legt den
 * Katalog mit `rowId: manifest.key` an, und genau dieser Wert steht in
 * `entitlements.featureKey`. Wird beim Kopieren eine neue Id vergeben, verliert
 * JEDE Produkt-Zuteilung ihren Bezug — lautlos. Deshalb `rowId: row.$id`,
 * genau wie bei control-022/023.
 *
 * NICHT angefasst: `media_items.featured` (heißt „hervorgehoben", nicht
 * „Feature") — die liegt ohnehin in anderen Projekten.
 *
 * IDEMPOTENT: Tabelle/Spalten über 409, Zeilen über eine Existenzprüfung je
 * Row-Id, Backfill nur wo das Ziel leer ist. Ein zweiter Lauf ändert nichts.
 *
 *   pnpm migrate --app control --layer control
 */
import { Client, Query, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
  process.exit(1)
}

const db = databaseId
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

const OLD = 'feature_catalog'
const NEW = 'product_catalog'

interface CatalogRow {
  $id: string
  tier: string
  requires: string
  hasMigrations: boolean
  title: string
  description: string
  icon: string
  syncedAt: string | null
}

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function step(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 409)) {
      console.log(`↷ ${label} (existiert bereits)`)
      return
    }
    throw error
  }
}

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId })
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration control-024 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

// ── 1. product_catalog, Form 1:1 aus control-002 ─────────────────────────────
await step(`Table ${NEW}`, () => tablesDB.createTable({
  databaseId: db, tableId: NEW, name: 'Product Catalog',
  permissions: [], rowSecurity: false,
}))
await step(`Column ${NEW}.tier`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'tier', size: 16, required: true,
}))
await step(`Column ${NEW}.requires`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'requires', size: 400, required: false, xdefault: '[]',
}))
await step(`Column ${NEW}.hasMigrations`, () => tablesDB.createBooleanColumn({
  databaseId: db, tableId: NEW, key: 'hasMigrations', required: false, xdefault: false,
}))
await step(`Column ${NEW}.title`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'title', size: 400, required: true,
}))
await step(`Column ${NEW}.description`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'description', size: 2000, required: true,
}))
await step(`Column ${NEW}.icon`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW, key: 'icon', size: 64, required: false, xdefault: '',
}))
await step(`Column ${NEW}.syncedAt`, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: NEW, key: 'syncedAt', required: false,
}))
await waitForColumns(NEW)

// ── 2. Katalog-Zeilen kopieren — MIT ihrer Row-Id (= dem Produkt-Schlüssel) ──
const alt = await tablesDB.listRows<CatalogRow>({
  databaseId: db, tableId: OLD, queries: [Query.limit(200)],
}).catch((error) => {
  if (hasCode(error, 404)) {
    console.log(`↷ Table ${OLD} existiert nicht — Kopieren übersprungen`)
    return null
  }
  throw error
})

if (alt) {
  console.log(`  ${alt.total} Zeile(n) in ${OLD}`)
  for (const row of alt.rows) {
    const schon = await tablesDB.getRow({ databaseId: db, tableId: NEW, rowId: row.$id }).catch(() => null)
    if (schon) {
      console.log(`↷ Row ${row.$id} — schon kopiert`)
      continue
    }
    await tablesDB.createRow({
      databaseId: db,
      tableId: NEW,
      // DIE ID IST DER PRODUKT-SCHLÜSSEL, nicht bloß eine Adresse.
      rowId: row.$id,
      data: {
        tier: row.tier,
        requires: row.requires ?? '[]',
        hasMigrations: row.hasMigrations ?? false,
        title: row.title,
        description: row.description,
        icon: row.icon ?? '',
        syncedAt: row.syncedAt ?? null,
      },
    })
    console.log(`✔ Row ${row.$id} kopiert`)
  }

  const neu = await tablesDB.listRows<CatalogRow>({
    databaseId: db, tableId: NEW, queries: [Query.limit(200)],
  })
  const fehlend = alt.rows.filter(row => !neu.rows.some(n => n.$id === row.$id))
  if (fehlend.length > 0) {
    throw new Error(`Kopie unvollständig — fehlende Ids: ${fehlend.map(r => r.$id).join(', ')}`)
  }
  console.log(`✔ Gegenprobe: ${neu.total} Zeile(n), alle Produkt-Schlüssel erhalten`)
}

// ── 3. entitlements.productKey NEBEN featureKey ──────────────────────────────
await step('Column entitlements.productKey', () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: 'entitlements', key: 'productKey', size: 64, required: false, xdefault: '',
}))
await waitForColumns('entitlements')

interface EntitlementLike { $id: string, featureKey?: string, productKey?: string }
const grants = await tablesDB.listRows<EntitlementLike>({
  databaseId: db, tableId: 'entitlements', queries: [Query.limit(1000)],
})
let befuellt = 0
for (const grant of grants.rows) {
  if (grant.productKey || !grant.featureKey) continue
  await tablesDB.updateRow({
    databaseId: db, tableId: 'entitlements', rowId: grant.$id,
    data: { productKey: grant.featureKey },
  })
  befuellt++
}
console.log(`✔ entitlements: ${befuellt} von ${grants.total} Zeile(n) mit productKey befüllt`)

// ── 4. websites.products NEBEN websites.features ─────────────────────────────
await step('Column websites.products', () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: 'websites', key: 'products', size: 1000, required: false, xdefault: '[]',
}))
await waitForColumns('websites')

interface WebsiteLike { $id: string, features?: string, products?: string }
const websites = await tablesDB.listRows<WebsiteLike>({
  databaseId: db, tableId: 'websites', queries: [Query.limit(200)],
})
let sites = 0
for (const site of websites.rows) {
  // '[]' ist der Default und zählt als „noch nicht befüllt".
  if (site.products && site.products !== '[]') continue
  if (!site.features || site.features === '[]') continue
  await tablesDB.updateRow({
    databaseId: db, tableId: 'websites', rowId: site.$id,
    data: { products: site.features },
  })
  sites++
}
console.log(`✔ websites: ${sites} von ${websites.total} Zeile(n) mit products befüllt`)

console.log('✔ Migration control-024 fertig — ALLES ADDITIV, alter Code läuft unverändert.')
console.log('  Nächster Schritt: Code auf product umstellen (Etappe B), deployen,')
console.log('  eine Nacht beobachten — DANN erst feature_catalog + die alten')
console.log('  Spalten löschen (eigene Migration).')
