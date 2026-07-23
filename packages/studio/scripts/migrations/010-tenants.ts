/**
 * Migration studio-010: Table `tenants` — das Host→Mandant-Register des
 * Control Plane (Horizont-3 Naht 1, Blueprint). Gelesen von Platform-Apps
 * über createTenantsTableResolver (Cross-Projekt, read-only); geschrieben
 * über sites.manage-Routen bzw. den Onboarding-Flow (Etappe 4.4).
 * Keine Client-Permissions. Additiv + idempotent (409 → skip).
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

console.log(`Migration studio-010 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table tenants', () => tablesDB.createTable({
  databaseId, tableId: 'tenants', name: 'Tenants',
  permissions: [], // nur Server (sites.manage + Cross-Projekt-Resolver-Key)
  rowSecurity: false,
}))

// Hostnamen sind max. 253 Zeichen (DNS)
await step('Column tenants.host', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tenants', key: 'host', size: 253, required: true,
}))
await step('Column tenants.mode', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tenants', key: 'mode', size: 8, required: true,
}))
await step('Column tenants.projectId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tenants', key: 'projectId', size: 36, required: true,
}))
await step('Column tenants.tenantId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tenants', key: 'tenantId', size: 36, required: false, xdefault: '',
}))
await step('Column tenants.status', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tenants', key: 'status', size: 12, required: false, xdefault: 'active',
}))

await waitForColumns('tenants')

// ein Host gehört genau einem Mandanten
await step('Index tenants.uq_host', () => tablesDB.createIndex({
  databaseId, tableId: 'tenants', key: 'uq_host', type: TablesDBIndexType.Unique, columns: ['host'],
}))
await step('Index tenants.idx_status', () => tablesDB.createIndex({
  databaseId, tableId: 'tenants', key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'],
}))

console.log('✔ Migration studio-010 fertig')
