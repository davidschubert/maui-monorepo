/**
 * Migration studio-007: Table `workspace_members` — M9-T1: bindet Studio-User
 * an Workspaces (v1 nur role 'owner'). Membership IST die Berechtigung des
 * Kundenbereichs (/workspace) — keine Labels/Capabilities. Keine
 * Client-Permissions: gelesen/geschrieben über Server-Routen (Guard
 * requireWorkspaceMember bzw. sites.manage).
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

console.log(`Migration studio-007 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table workspace_members', () => tablesDB.createTable({
  databaseId, tableId: 'workspace_members', name: 'Workspace Members',
  permissions: [], // nur Server-Routen
  rowSecurity: false,
}))

await step('Column workspaceId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspace_members', key: 'workspaceId', size: 36, required: true,
}))
await step('Column userId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspace_members', key: 'userId', size: 36, required: true,
}))
await step('Column role', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspace_members', key: 'role', size: 16, required: false, xdefault: 'owner',
}))

await waitForColumns('workspace_members')

await step('Index uq_workspace_user', () => tablesDB.createIndex({
  databaseId, tableId: 'workspace_members', key: 'uq_workspace_user',
  type: TablesDBIndexType.Unique, columns: ['workspaceId', 'userId'],
}))
await step('Index idx_user', () => tablesDB.createIndex({
  databaseId, tableId: 'workspace_members', key: 'idx_user',
  type: TablesDBIndexType.Key, columns: ['userId'],
}))

console.log('✔ Migration studio-007 fertig')
