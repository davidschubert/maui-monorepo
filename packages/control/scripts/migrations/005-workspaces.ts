/**
 * Migration studio-005: Table `workspaces` — ein Workspace = ein zahlender
 * Kunde des Control Plane (M8). Keine Client-Permissions: gelesen/geschrieben
 * über sites.manage-Routen bzw. den Fulfillment-Handler.
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

console.log(`Migration studio-005 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table workspaces', () => tablesDB.createTable({
  databaseId, tableId: 'workspaces', name: 'Workspaces',
  permissions: [], // nur Server (sites.manage-Routen) + Fulfillment
  rowSecurity: false,
}))

await step('Column workspaces.name', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspaces', key: 'name', size: 120, required: true,
}))
await step('Column workspaces.ownerEmail', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspaces', key: 'ownerEmail', size: 254, required: true,
}))
await step('Column workspaces.stripeCustomerId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspaces', key: 'stripeCustomerId', size: 64, required: false, xdefault: '',
}))
await step('Column workspaces.plan', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspaces', key: 'plan', size: 32, required: false, xdefault: 'free',
}))
await step('Column workspaces.status', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspaces', key: 'status', size: 16, required: false, xdefault: 'active',
}))

await waitForColumns('workspaces')

await step('Index workspaces.idx_stripe_customer', () => tablesDB.createIndex({
  databaseId, tableId: 'workspaces', key: 'idx_stripe_customer', type: TablesDBIndexType.Key, columns: ['stripeCustomerId'],
}))

console.log('✔ Migration studio-005 fertig')
