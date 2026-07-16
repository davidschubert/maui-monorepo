/**
 * Migration studio-003: Table `entitlements` — Row pro Site×Feature
 * (M6-T3, F3-Vorstufe ohne Signatur/Stripe). Keine Client-Permissions:
 * gelesen/geschrieben über die sites.manage-Routen bzw. den Job-Runner.
 * Additiv + idempotent (409 → skip).
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

console.log(`Migration studio-003 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table entitlements', () => tablesDB.createTable({
  databaseId, tableId: 'entitlements', name: 'Entitlements',
  permissions: [], // nur Server (sites.manage-Routen) + Job-Runner
  rowSecurity: false,
}))

await step('Column entitlements.siteProjectId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'entitlements', key: 'siteProjectId', size: 64, required: true,
}))
await step('Column entitlements.featureKey', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'entitlements', key: 'featureKey', size: 32, required: true,
}))
await step('Column entitlements.status', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'entitlements', key: 'status', size: 16, required: false, xdefault: 'active',
}))
await step('Column entitlements.notes', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'entitlements', key: 'notes', size: 500, required: false, xdefault: '',
}))

await waitForColumns('entitlements')

await step('Index entitlements.idx_site_feature (unique)', () => tablesDB.createIndex({
  databaseId, tableId: 'entitlements', key: 'idx_site_feature', type: TablesDBIndexType.Unique, columns: ['siteProjectId', 'featureKey'],
}))
await step('Index entitlements.idx_site', () => tablesDB.createIndex({
  databaseId, tableId: 'entitlements', key: 'idx_site', type: TablesDBIndexType.Key, columns: ['siteProjectId'],
}))

console.log('✔ Migration studio-003 fertig')
