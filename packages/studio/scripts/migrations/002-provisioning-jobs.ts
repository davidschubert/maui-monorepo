/**
 * Migration studio-002: Tables `provisioning_jobs` + `feature_catalog`
 * (M6-T2, Vorstufe Provisioner-Vertrag § 8). Beide ohne Client-Permissions —
 * gelesen/geschrieben wird server-seitig (sites.manage-Routen) bzw. vom
 * Job-Runner (Admin-Key). Additiv + idempotent (409 → skip).
 *
 * Zeilenbudget (MariaDB/utf8mb4, ~16k Zeichen je Row): log 10000 + payload
 * 2000 + result 1000 + Kleinspalten ≈ 13,3k — bewusst unter dem Limit.
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

console.log(`Migration studio-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// ── provisioning_jobs ───────────────────────────────────────────────────────
await step('Table provisioning_jobs', () => tablesDB.createTable({
  databaseId, tableId: 'provisioning_jobs', name: 'Provisioning Jobs',
  permissions: [], // nur Server (sites.manage-Routen) + Runner (Admin-Key)
  rowSecurity: false,
}))

await step('Column provisioning_jobs.type', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'type', size: 32, required: true,
}))
await step('Column provisioning_jobs.payload', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'payload', size: 2000, required: true,
}))
await step('Column provisioning_jobs.status', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'status', size: 16, required: false, xdefault: 'queued',
}))
await step('Column provisioning_jobs.log', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'log', size: 10000, required: false, xdefault: '',
}))
await step('Column provisioning_jobs.result', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'result', size: 1000, required: false, xdefault: '',
}))
await step('Column provisioning_jobs.requestedBy', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'requestedBy', size: 64, required: false, xdefault: '',
}))
await step('Column provisioning_jobs.runnerId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'runnerId', size: 64, required: false, xdefault: '',
}))
await step('Column provisioning_jobs.startedAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'startedAt', required: false,
}))
await step('Column provisioning_jobs.finishedAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'finishedAt', required: false,
}))

await waitForColumns('provisioning_jobs')

await step('Index provisioning_jobs.idx_status', () => tablesDB.createIndex({
  databaseId, tableId: 'provisioning_jobs', key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'],
}))

// ── feature_catalog (rowId = Feature-Key) ───────────────────────────────────
await step('Table feature_catalog', () => tablesDB.createTable({
  databaseId, tableId: 'feature_catalog', name: 'Feature Catalog',
  permissions: [], // nur Server; Sync schreibt der Job-Runner
  rowSecurity: false,
}))

await step('Column feature_catalog.tier', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feature_catalog', key: 'tier', size: 16, required: true,
}))
await step('Column feature_catalog.requires', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feature_catalog', key: 'requires', size: 400, required: false, xdefault: '[]',
}))
await step('Column feature_catalog.hasMigrations', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'feature_catalog', key: 'hasMigrations', required: false, xdefault: false,
}))
await step('Column feature_catalog.title', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feature_catalog', key: 'title', size: 400, required: true,
}))
await step('Column feature_catalog.description', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feature_catalog', key: 'description', size: 2000, required: true,
}))
await step('Column feature_catalog.icon', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feature_catalog', key: 'icon', size: 64, required: false, xdefault: '',
}))
await step('Column feature_catalog.syncedAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'feature_catalog', key: 'syncedAt', required: false,
}))

await waitForColumns('feature_catalog')

console.log('✔ Migration studio-002 fertig')
