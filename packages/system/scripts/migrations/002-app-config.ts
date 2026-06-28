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
import { Client, TablesDB, type Models } from 'node-appwrite'

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
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration system-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table app_config', () => tablesDB.createTable({
  databaseId, tableId: 'app_config', name: 'App Config', permissions: [], rowSecurity: false,
}))

await step('Column app_config.registrationEnabled', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'app_config', key: 'registrationEnabled', required: false, xdefault: true,
}))
await step('Column app_config.commentsEnabled', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'app_config', key: 'commentsEnabled', required: false, xdefault: true,
}))
await step('Column app_config.maintenanceMode', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'app_config', key: 'maintenanceMode', required: false, xdefault: false,
}))

await waitForColumns('app_config')

await step('Row app_config/global', () => tablesDB.createRow<AppConfigRow>({
  databaseId, tableId: 'app_config', rowId: 'global',
  data: { registrationEnabled: true, commentsEnabled: true, maintenanceMode: false },
}))

console.log('✔ Migration system-002 fertig')
