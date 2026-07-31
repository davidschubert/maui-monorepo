/**
 * Migration control-025: feature→product ZUSAMMENZIEHEN (E11, dritter Schritt
 * von Ausdehnen → Umziehen → Zusammenziehen).
 *
 * Läuft NACH dem Deploy des Codes, der die alten Namen weder liest noch
 * schreibt (die Dual-Writes aus Etappe B sind entfernt). David hat die
 * Beobachtungsnacht ausdrücklich erlassen (2026-07-30, kein Produktivbetrieb).
 *
 * REIHENFOLGE IST SICHERHEIT: der Unique-Index `idx_site_product`
 * (siteProjectId, productKey) entsteht ZUERST — vorher wird productKey
 * nachbefüllt, falls im Fenster zwischen control-024 und dem Etappe-B-Deploy
 * noch Zeilen ohne ihn entstanden sind (leere Werte würden im Unique-Index
 * kollidieren). Erst DANACH fallen `idx_site_feature` und die Spalte
 * `featureKey` — nie ein Fenster ohne Eindeutigkeitsschutz (Muster
 * courses-002/pages-004).
 *
 * Danach: `websites.features` (products ist seit control-024 befüllt und wird
 * seit Etappe B geschrieben) und die Alt-Tabelle `feature_catalog`
 * (product_catalog trägt dieselben Zeilen MIT ihren Row-Ids).
 *
 * IDEMPOTENT: createIndex über 409, Deletes über 404. Ein zweiter Lauf tut
 * nichts.
 *
 *   pnpm migrate --app control --layer control
 */
import { Client, Query, TablesDB, TablesDBIndexType, type Models } from 'node-appwrite'

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

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function step(label: string, run: () => Promise<unknown>, skipCodes: number[] = [409, 404]) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (skipCodes.some(code => hasCode(error, code))) {
      console.log(`↷ ${label} (schon erledigt/nicht vorhanden)`)
      return
    }
    throw error
  }
}

async function waitForIndex(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    const { indexes } = await tablesDB.listIndexes({ databaseId: db, tableId })
    const index = indexes.find(i => i.key === key)
    if (index && index.status === 'available') return
    if (!index) return // 409-Skip: Index existierte schon vorher als available oder Tabelle kennt ihn nicht
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Index "${tableId}.${key}" wurde nicht verfügbar`)
}

console.log(`Migration control-025 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

// ── 1. Netz: productKey nachbefüllen, wo er noch leer ist ────────────────────
interface EntitlementLike extends Models.Row { featureKey?: string, productKey?: string }
const grants = await tablesDB.listRows<EntitlementLike>({
  databaseId: db, tableId: 'entitlements', queries: [Query.limit(1000)],
}).catch((error) => {
  if (hasCode(error, 404)) return null
  throw error
})
if (grants) {
  let nachbefuellt = 0
  for (const grant of grants.rows) {
    if (grant.productKey || !grant.featureKey) continue
    await tablesDB.updateRow({
      databaseId: db, tableId: 'entitlements', rowId: grant.$id,
      data: { productKey: grant.featureKey },
    })
    nachbefuellt++
  }
  console.log(`✔ entitlements: ${nachbefuellt} Nachzügler mit productKey befüllt (${grants.total} gesamt)`)

  // ── 2. Unique-Index auf der NEUEN Spalte, dann erst der alte weg ───────────
  await step('Index entitlements.idx_site_product', () => tablesDB.createIndex({
    databaseId: db, tableId: 'entitlements', key: 'idx_site_product',
    type: TablesDBIndexType.Unique, columns: ['siteProjectId', 'productKey'],
  }))
  await waitForIndex('entitlements', 'idx_site_product')
  // destruktiv-ok: E11-Zusammenziehen — idx_site_product ist zuvor available,
  // nie ein Fenster ohne Eindeutigkeitsschutz; der Code liest/schreibt die
  // alten Namen seit Etappe B nicht mehr (Beobachtungsnacht von David erlassen).
  await step('Index entitlements.idx_site_feature löschen', () => tablesDB.deleteIndex({
    databaseId: db, tableId: 'entitlements', key: 'idx_site_feature',
  }))
  await step('Column entitlements.featureKey löschen', () => tablesDB.deleteColumn({
    databaseId: db, tableId: 'entitlements', key: 'featureKey',
  }))
}

// ── 3. websites.features weg (products trägt den Snapshot) ───────────────────
// destruktiv-ok: products trägt den Snapshot seit control-024 und wird seit
// Etappe B geschrieben — features ist ungelesene Kopie.
await step('Column websites.features löschen', () => tablesDB.deleteColumn({
  databaseId: db, tableId: 'websites', key: 'features',
}))

// ── 4. Alt-Tabelle feature_catalog weg ───────────────────────────────────────
// destruktiv-ok: product_catalog trägt dieselben Zeilen MIT ihren Row-Ids
// (control-024, Gegenprobe fail-loud) — der Katalog wird zudem aus den
// Manifesten regeneriert (control:jobs).
await step('Table feature_catalog löschen', () => tablesDB.deleteTable({
  databaseId: db, tableId: 'feature_catalog',
}))

console.log('✔ Migration control-025 fertig — der product-Vertrag steht allein.')
