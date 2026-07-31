/**
 * Migration system-023: app_config.products NEBEN features, ADDITIV.
 *
 * Zweite Lücke der feature→product-Umbenennung (E11 Etappe B, gefunden beim
 * Trockenlauf 2026-07-30): `features` in AppConfigRow ist nicht bloß ein
 * TypeScript-Feld, sondern die Appwrite-Spalte `app_config.features`
 * (system-018) — und app_config steuert die Produkt-Gates auf ALLEN vier
 * Instanzen. Hätte man den Code zuerst umbenannt, läse und schriebe er
 * überall gegen eine Spalte, die es nirgends gibt.
 *
 * WARUM MEDIUMTEXT statt varchar(4000): app_config ist am utf8mb4-
 * Zeilenbudget von MariaDB (die N2-Falle aus system-018 — Appwrite prüft die
 * Größe VOR der Duplikat-Erkennung). Nach themeSettings(4096) +
 * entitlements(4000) + features(4000) würde eine weitere 4000er-Spalte das
 * ~65-KB-Budget reißen. Mediumtext liegt off-row und zählt nicht ins Budget
 * (Muster pages-002); die Spalte trägt einen JSON-String und braucht weder
 * Index noch Query.equal.
 *
 * IDEMPOTENT: Spalte über columnExists-Vorab-Check (das 400
 * `column_limit_exceeded` von app_config ersetzt hier das 409), Backfill nur
 * wo das Ziel leer ist. Ein zweiter Lauf ändert nichts.
 *
 *   pnpm migrate --app <app> --layer system
 */
import { Client, Query, TablesDB, type Models } from 'node-appwrite'

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

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

async function columnExists(tableId: string, key: string): Promise<boolean> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    return columns.some(column => column.key === key)
  }
  catch {
    return false
  }
}

async function waitForColumn(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    const column = columns.find(c => c.key === key)
    if (column && column.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Column "${tableId}.${key}" wurde nicht verfügbar`)
}

console.log(`Migration system-023 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

if (await columnExists('app_config', 'products')) {
  console.log('↷ Column app_config.products (existiert bereits)')
}
else {
  await tablesDB.createMediumtextColumn({
    databaseId, tableId: 'app_config', key: 'products', required: false, xdefault: '',
  })
  console.log('✔ Column app_config.products (mediumtext)')
}
await waitForColumn('app_config', 'products')

// Backfill: features → products, nur wo das Ziel leer ist. app_config hat in
// der Praxis genau eine Zeile ('global') — das Limit ist nur ein Netz.
type AppConfigLike = Models.Row & { features?: string, products?: string }
const rows = await tablesDB.listRows<AppConfigLike>({
  databaseId, tableId: 'app_config', queries: [Query.limit(100)],
})
let befuellt = 0
for (const row of rows.rows) {
  if (row.products || !row.features) continue
  await tablesDB.updateRow({
    databaseId, tableId: 'app_config', rowId: row.$id,
    data: { products: row.features },
  })
  befuellt++
}
console.log(`✔ app_config: ${befuellt} von ${rows.total} Zeile(n) mit products befüllt`)

// Gegenprobe: nirgends darf features gefüllt und products leer sein.
const nachher = await tablesDB.listRows<AppConfigLike>({
  databaseId, tableId: 'app_config', queries: [Query.limit(100)],
})
const luecken = nachher.rows.filter(row => row.features && !row.products)
if (luecken.length > 0) {
  throw new Error(`Backfill unvollständig — Rows ohne products: ${luecken.map(r => r.$id).join(', ')}`)
}

console.log('✔ Migration system-023 fertig — ADDITIV, alter Code läuft unverändert.')
