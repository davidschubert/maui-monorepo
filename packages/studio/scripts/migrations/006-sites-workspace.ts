/**
 * Migration studio-006: `sites.workspaceId` (nullable) — Zuordnung Site →
 * Workspace (M8). `''`/fehlend = impliziter Betreiber-Workspace: verhält
 * sich exakt wie vor M8 (manuelle Grants, kein Billing).
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

async function waitForColumn(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    const column = columns.find(c => c.key === key)
    if (column && column.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Column "${tableId}.${key}" wurde nicht verfügbar`)
}

console.log(`Migration studio-006 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Column sites.workspaceId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'sites', key: 'workspaceId', size: 36, required: false, xdefault: '',
}))

await waitForColumn('sites', 'workspaceId')

await step('Index sites.idx_workspace', () => tablesDB.createIndex({
  databaseId, tableId: 'sites', key: 'idx_workspace', type: TablesDBIndexType.Key, columns: ['workspaceId'],
}))

console.log('✔ Migration studio-006 fertig')
