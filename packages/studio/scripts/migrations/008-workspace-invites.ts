/**
 * Migration studio-008: Table `workspace_invites` — M9-T2: einmalige
 * Owner-Einladungen (7 Tage gültig). Es wird NUR der SHA-256-Hash des
 * Tokens gespeichert (DB-Leak ≠ gültige Einladungen); der Klartext-Token
 * steht ausschließlich im Mail-Link. Keine Client-Permissions.
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

console.log(`Migration studio-008 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table workspace_invites', () => tablesDB.createTable({
  databaseId, tableId: 'workspace_invites', name: 'Workspace Invites',
  permissions: [], // nur Server-Routen
  rowSecurity: false,
}))

await step('Column workspaceId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspace_invites', key: 'workspaceId', size: 36, required: true,
}))
await step('Column email', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspace_invites', key: 'email', size: 254, required: true,
}))
await step('Column tokenHash', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspace_invites', key: 'tokenHash', size: 64, required: true,
}))
await step('Column status', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspace_invites', key: 'status', size: 16, required: false, xdefault: 'pending',
}))
await step('Column expiresAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'workspace_invites', key: 'expiresAt', required: true,
}))
await step('Column acceptedBy', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspace_invites', key: 'acceptedBy', size: 36, required: false, xdefault: '',
}))

await waitForColumns('workspace_invites')

await step('Index uq_token', () => tablesDB.createIndex({
  databaseId, tableId: 'workspace_invites', key: 'uq_token',
  type: TablesDBIndexType.Unique, columns: ['tokenHash'],
}))
await step('Index idx_workspace', () => tablesDB.createIndex({
  databaseId, tableId: 'workspace_invites', key: 'idx_workspace',
  type: TablesDBIndexType.Key, columns: ['workspaceId'],
}))

console.log('✔ Migration studio-008 fertig')
