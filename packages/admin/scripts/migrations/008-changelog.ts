/**
 * Migration admin-008: changelog Table (Produkt-„Was ist neu").
 *
 * Im Dashboard gepflegte Release-Notes, öffentlich lesbar (read: any) für die
 * „Was ist neu"-Ansicht + Realtime-Badge. Schreiben server-only (Admin-Routen
 * über den Runtime-Key) — kein Client-Write-Recht. Idempotent (409 → skip).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/admin/scripts/migrations/008-changelog.ts
 *
 * Benötigte Key-Scopes: tables.*, columns.*, rows.* (Migrations-Key).
 */
import { Client, TablesDB, Permission, Role } from 'node-appwrite'

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

console.log(`Migration admin-008 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table changelog', () => tablesDB.createTable({
  databaseId, tableId: 'changelog', name: 'Changelog',
  permissions: [Permission.read(Role.any())], rowSecurity: false,
}))

await step('Column changelog.title', () => tablesDB.createStringColumn({
  databaseId, tableId: 'changelog', key: 'title', size: 200, required: true,
}))
await step('Column changelog.body', () => tablesDB.createStringColumn({
  databaseId, tableId: 'changelog', key: 'body', size: 5000, required: true,
}))
await step('Column changelog.category', () => tablesDB.createStringColumn({
  databaseId, tableId: 'changelog', key: 'category', size: 20, required: false,
}))
await step('Column changelog.version', () => tablesDB.createStringColumn({
  databaseId, tableId: 'changelog', key: 'version', size: 30, required: false,
}))
await step('Column changelog.published', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'changelog', key: 'published', required: false, xdefault: true,
}))

await waitForColumns('changelog')

await step('Index changelog.published', () => tablesDB.createIndex({
  databaseId, tableId: 'changelog', key: 'published', type: 'key', columns: ['published'],
}))

console.log('✔ Migration admin-008 fertig')
