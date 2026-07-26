/**
 * Migration studio-001: Table `sites` — das Sites-Register des Control Plane
 * (M6/L2/L5). Bewusst KEINE Table-/Row-Permissions für Clients: gelesen und
 * geschrieben wird ausschließlich server-seitig über die sites.manage-Routen
 * (Admin-Client) — das Register führt Endpoints/Status aller Sites und ist
 * nicht öffentlich. Additiv + idempotent (409 → skip).
 *
 *   pnpm migrate --app <app> --layer studio
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
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration studio-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table sites', () => tablesDB.createTable({
  databaseId, tableId: 'sites', name: 'Sites',
  permissions: [], // nur Server (Admin-Client) — Register ist nicht öffentlich
  rowSecurity: false,
}))

await step('Column sites.name', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'sites', key: 'name', size: 100, required: true,
}))
await step('Column sites.slug', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'sites', key: 'slug', size: 64, required: true,
}))
await step('Column sites.projectId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'sites', key: 'projectId', size: 64, required: true,
}))
await step('Column sites.endpoint', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'sites', key: 'endpoint', size: 256, required: true,
}))
await step('Column sites.appUrl', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'sites', key: 'appUrl', size: 256, required: false, xdefault: '',
}))
await step('Column sites.status', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'sites', key: 'status', size: 24, required: false, xdefault: 'active',
}))
await step('Column sites.healthStatus', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'sites', key: 'healthStatus', size: 16, required: false, xdefault: 'unknown',
}))
await step('Column sites.healthCheckedAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'sites', key: 'healthCheckedAt', required: false,
}))
await step('Column sites.notes', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'sites', key: 'notes', size: 1000, required: false, xdefault: '',
}))

await waitForColumns('sites')

await step('Index sites.idx_slug (unique)', () => tablesDB.createIndex({
  databaseId, tableId: 'sites', key: 'idx_slug', type: TablesDBIndexType.Unique, columns: ['slug'],
}))
await step('Index sites.idx_status', () => tablesDB.createIndex({
  databaseId, tableId: 'sites', key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'],
}))

console.log('✔ Migration studio-001 fertig')
