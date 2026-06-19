/**
 * Migration admin-001: audit_logs Table.
 *
 * Protokolliert privilegierte Admin-Aktionen (Sperren, Moderation, Rollen …).
 * Nur serverseitig beschrieben/gelesen (API-Key) — keine Row-Permissions.
 * Idempotent (409 → skip).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/admin/scripts/migrations/001-audit-logs.ts
 *
 * Benötigte Key-Scopes: tables.*, columns.*, indexes.* (Migrations-Key).
 */
import { Client, TablesDB } from 'node-appwrite'

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
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration admin-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// Keine Row-Permissions → ausschließlich über den Server-API-Key zugreifbar
await step('Table audit_logs', () => tablesDB.createTable({
  databaseId,
  tableId: 'audit_logs',
  name: 'Audit Logs',
  permissions: [],
  rowSecurity: false,
}))

await step('Column audit_logs.actorId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'audit_logs', key: 'actorId', size: 255, required: true,
}))
await step('Column audit_logs.actorName', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'audit_logs', key: 'actorName', size: 255, required: true,
}))
await step('Column audit_logs.action', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'audit_logs', key: 'action', size: 64, required: true,
}))
await step('Column audit_logs.targetType', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'audit_logs', key: 'targetType', size: 64, required: false,
}))
await step('Column audit_logs.targetId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'audit_logs', key: 'targetId', size: 255, required: false,
}))
await step('Column audit_logs.targetName', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'audit_logs', key: 'targetName', size: 255, required: false,
}))
await step('Column audit_logs.metadata', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'audit_logs', key: 'metadata', size: 4000, required: false,
}))

await waitForColumns('audit_logs')

await step('Index audit_logs.action', () => tablesDB.createIndex({
  databaseId, tableId: 'audit_logs', key: 'action', type: 'key', columns: ['action'],
}))
await step('Index audit_logs.actor', () => tablesDB.createIndex({
  databaseId, tableId: 'audit_logs', key: 'actor', type: 'key', columns: ['actorId'],
}))

console.log('✔ Migration admin-001 fertig')
