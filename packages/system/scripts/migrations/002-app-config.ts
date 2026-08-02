/**
 * Migration system-002: app_config Table (Feature-Flags / Laufzeit-Konfiguration).
 *
 * Eine einzelne Zeile 'global' mit Schaltern, die im Dashboard bearbeitet und
 * serverseitig durchgesetzt werden. Nur über den Server-Key zugreifbar.
 * Idempotent (409 → skip).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/system/scripts/migrations/002-app-config.ts
 *
 * Benötigte Key-Scopes: tables.*, columns.*, rows.* (Migrations-Key).
 */
import { Client, Query, TablesDB, type Models } from 'node-appwrite'

interface AppConfigRow extends Models.Row {
  registrationEnabled: boolean
  commentsEnabled: boolean
  maintenanceMode: boolean
}

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — Script mit --env-file=apps/<app>/.env aufrufen.')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

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
/**
 * app_config ist am utf8mb4-Zeilenbudget von MariaDB angekommen — Appwrite
 * prüft die Größe VOR der Duplikat-Erkennung und antwortet auf ein erneutes
 * createColumn mit 400 `column_limit_exceeded` statt 409. Ohne Vorab-Check
 * wäre diese Migration nicht mehr idempotent (N2).
 */
async function ensureColumn(tableId: string, key: string, create: () => Promise<unknown>) {
  try {
    // Query.limit ist PFLICHT (Falle aus events-006, nachgezogen 2026-08-02):
    // ohne explizites Limit liefert listColumns 25 Spalten, und app_config
    // wächst mit jedem Flag. Eine abgeschnittene Liste meldet "Spalte fehlt" —
    // createColumn antwortet dann 400 column_limit_exceeded statt 409, und
    // genau die 409-Abkürzung ist die Idempotenz dieser Migration.
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId, queries: [Query.limit(200)] })
    if (columns.some(column => column.key === key)) {
      console.log(`↷ Column ${tableId}.${key} (existiert bereits)`)
      return
    }
  }
  catch {
    // Table fehlt o. Ä. — step() unten meldet es sauber
  }
  await step(`Column ${tableId}.${key}`, create)
}
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    // Query.limit ist PFLICHT (Falle aus events-006, nachgezogen 2026-08-02):
    // ohne explizites Limit liefert listColumns 25 Spalten, und app_config
    // wächst mit jedem Flag. Eine abgeschnittene Liste meldet "Spalte fehlt" —
    // createColumn antwortet dann 400 column_limit_exceeded statt 409, und
    // genau die 409-Abkürzung ist die Idempotenz dieser Migration.
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId, queries: [Query.limit(200)] })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration system-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table app_config', () => tablesDB.createTable({
  databaseId, tableId: 'app_config', name: 'App Config', permissions: [], rowSecurity: false,
}))

await ensureColumn('app_config', 'registrationEnabled', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'app_config', key: 'registrationEnabled', required: false, xdefault: true,
}))
await ensureColumn('app_config', 'commentsEnabled', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'app_config', key: 'commentsEnabled', required: false, xdefault: true,
}))
await ensureColumn('app_config', 'maintenanceMode', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'app_config', key: 'maintenanceMode', required: false, xdefault: false,
}))

await waitForColumns('app_config')

await step('Row app_config/global', () => tablesDB.createRow<AppConfigRow>({
  databaseId, tableId: 'app_config', rowId: 'global',
  data: { registrationEnabled: true, commentsEnabled: true, maintenanceMode: false },
}))

console.log('✔ Migration system-002 fertig')
