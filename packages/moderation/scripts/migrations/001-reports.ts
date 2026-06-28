/**
 * Migration 001: `reports`-Table des Moderation-Layers (additiv, idempotent).
 *
 * Domänen-agnostisch: targetType+targetId, eine Meldung pro User/Target
 * (Unique-Index), Status-Lifecycle open/reviewing/resolved/dismissed.
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/moderation/scripts/migrations/001-reports.ts
 *
 * Benötigte Key-Scopes: tables.*, columns.*, indexes.* (Migrations-Key, A2).
 */
import { Client, TablesDB, Permission, Role, TablesDBIndexType } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY. Empfohlen: separater Migrations-Key (Konzept A2).')
}

if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — Script mit --env-file=apps/<app>/.env aufrufen.')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)

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
    if (columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration 001 (reports) gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// Reads laufen serverseitig über den AdminClient (Queue, requirePermission) —
// daher KEIN public read. Create für eingeloggte User; Row-Security an, damit
// der Melder nur seine eigene Meldung lesen/zurückziehen kann.
await step('Table reports', () => tablesDB.createTable({
  databaseId,
  tableId: 'reports',
  name: 'Reports',
  permissions: [Permission.create(Role.users())],
  rowSecurity: true,
}))

await step('Column reports.reporterId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'reports', key: 'reporterId', size: 255, required: true,
}))
await step('Column reports.targetType', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'reports', key: 'targetType', size: 64, required: true,
}))
await step('Column reports.targetId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'reports', key: 'targetId', size: 255, required: true,
}))
await step('Column reports.reason', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'reports', key: 'reason', size: 64, required: true,
}))
await step('Column reports.note', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'reports', key: 'note', size: 2000, required: false,
}))
await step('Column reports.status', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'reports', key: 'status', size: 16, required: false, xdefault: 'open',
}))
await step('Column reports.resolvedBy', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'reports', key: 'resolvedBy', size: 255, required: false,
}))
await step('Column reports.resolution', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'reports', key: 'resolution', size: 32, required: false,
}))

await waitForColumns('reports')

await step('Index reports.target', () => tablesDB.createIndex({
  databaseId, tableId: 'reports', key: 'target', type: TablesDBIndexType.Key, columns: ['targetType', 'targetId'],
}))
await step('Unique-Index reports.reporter_target', () => tablesDB.createIndex({
  databaseId, tableId: 'reports', key: 'reporter_target', type: TablesDBIndexType.Unique, columns: ['reporterId', 'targetType', 'targetId'],
}))
await step('Index reports.status', () => tablesDB.createIndex({
  databaseId, tableId: 'reports', key: 'status', type: TablesDBIndexType.Key, columns: ['status'],
}))

console.log('Migration 001 (reports) abgeschlossen.')
