/**
 * Migration system-003: notifications Table (In-App-Benachrichtigungen).
 *
 * rowSecurity = true: erstellt werden Zeilen serverseitig mit read/update-Recht
 * für den Empfänger; jeder sieht/ändert nur seine eigenen. Idempotent (409 → skip).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/system/scripts/migrations/003-notifications.ts
 *
 * Benötigte Key-Scopes: tables.*, columns.*, indexes.* (Migrations-Key).
 */
import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite'

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

console.log(`Migration system-003 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table notifications', () => tablesDB.createTable({
  databaseId, tableId: 'notifications', name: 'Notifications', permissions: [], rowSecurity: true,
}))

await step('Column notifications.recipientId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'notifications', key: 'recipientId', size: 255, required: true,
}))
await step('Column notifications.type', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'notifications', key: 'type', size: 32, required: true,
}))
await step('Column notifications.title', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'notifications', key: 'title', size: 255, required: true,
}))
await step('Column notifications.body', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'notifications', key: 'body', size: 1000, required: false,
}))
await step('Column notifications.link', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'notifications', key: 'link', size: 1024, required: false,
}))
await step('Column notifications.read', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'notifications', key: 'read', required: false, xdefault: false,
}))

await waitForColumns('notifications')

await step('Index notifications.recipient', () => tablesDB.createIndex({
  databaseId, tableId: 'notifications', key: 'recipient', type: TablesDBIndexType.Key, columns: ['recipientId'],
}))

console.log('✔ Migration system-003 fertig')
