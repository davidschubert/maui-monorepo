/**
 * Migration system-014: activities Table (Activity-Feed, Phase 21).
 *
 * rowSecurity = true: Zeilen entstehen NUR server-seitig über den Core-Vertrag
 * recordActivity() (read für Role.users()); gelöscht wird via Admin-Client
 * (feed.manage-Route, GDPR-Contributor). Kein User-Schreibrecht auf der Table.
 * Idempotent (409 → skip). Aufruf über den zentralen Runner:
 *
 *   pnpm migrate --app <app> --layer system
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
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
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

console.log(`Migration system-014 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table activities', () => tablesDB.createTable({
  databaseId, tableId: 'activities', name: 'Activities', permissions: [], rowSecurity: true,
}))

await step('Column activities.actorId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'activities', key: 'actorId', size: 36, required: true,
}))
await step('Column activities.actorName', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'activities', key: 'actorName', size: 255, required: false, xdefault: '',
}))
await step('Column activities.type', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'activities', key: 'type', size: 64, required: true,
}))
await step('Column activities.objectType', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'activities', key: 'objectType', size: 64, required: true,
}))
await step('Column activities.objectId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'activities', key: 'objectId', size: 36, required: true,
}))
await step('Column activities.link', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'activities', key: 'link', size: 1024, required: false, xdefault: '',
}))
// metadata: kleines JSON für den i18n-Text (recordActivity verwirft Übergrößen)
await step('Column activities.metadata', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'activities', key: 'metadata', size: 2000, required: false, xdefault: '',
}))
// 'public' ist reserviert (v2) — recordActivity schreibt v1 immer 'members'
await step('Column activities.visibility', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'activities', key: 'visibility', size: 16, required: false, xdefault: 'members',
}))

await waitForColumns('activities')

await step('Index activities.idx_actor', () => tablesDB.createIndex({
  databaseId, tableId: 'activities', key: 'idx_actor', type: TablesDBIndexType.Key, columns: ['actorId'],
}))
await step('Index activities.idx_type', () => tablesDB.createIndex({
  databaseId, tableId: 'activities', key: 'idx_type', type: TablesDBIndexType.Key, columns: ['type'],
}))

console.log('✔ Migration system-014 fertig')
