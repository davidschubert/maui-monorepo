/**
 * Migration admin-007: presence Table (Online-/Heartbeat-Status).
 *
 * Appwrites Presence-API ist self-hosted nicht verfügbar → eigener Mechanismus:
 * Der Client schreibt per Heartbeat (~20s) seinen lastSeen-Zeitstempel; als
 * "online" gilt, wer innerhalb des Frischefensters einen Heartbeat hatte.
 * scope = 'global' (eingeloggt/live) oder '<type>:<id>' (in einem Thread).
 *
 * read: any (Zähler/Anwesenheit sind nicht sensibel); schreiben tut der User
 * seine eigene Row (Server-Session-Client, Row-Permissions update/delete).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/admin/scripts/migrations/007-presence.ts
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

console.log(`Migration admin-007 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table presence', () => tablesDB.createTable({
  databaseId,
  tableId: 'presence',
  name: 'Presence',
  permissions: [Permission.read(Role.any()), Permission.create(Role.users())],
  rowSecurity: true,
}))

await step('Column presence.userId', () => tablesDB.createStringColumn({
  databaseId, tableId: 'presence', key: 'userId', size: 36, required: true,
}))
await step('Column presence.userName', () => tablesDB.createStringColumn({
  databaseId, tableId: 'presence', key: 'userName', size: 255, required: false,
}))
await step('Column presence.scope', () => tablesDB.createStringColumn({
  databaseId, tableId: 'presence', key: 'scope', size: 64, required: true,
}))
await step('Column presence.lastSeen', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'presence', key: 'lastSeen', required: true,
}))
await step('Column presence.typing', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'presence', key: 'typing', required: false, xdefault: false,
}))

await waitForColumns('presence')

await step('Index presence.scope_lastSeen', () => tablesDB.createIndex({
  databaseId, tableId: 'presence', key: 'scope_lastSeen', type: 'key', columns: ['scope', 'lastSeen'],
}))

console.log('✔ Migration admin-007 fertig')
