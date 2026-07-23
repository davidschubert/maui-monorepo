/**
 * Migration comments-012: `embed_sites` — Site-Registry des Embed-Widgets
 * (E3, Embed-Plan Task 14): registrierte Einbetter-Domains speisen die
 * frame-ancestors-CSP von /embed (statt statischer Allowlist). Zugriff NUR
 * über Admin-Routen (system.manage) — keine Table-Permissions.
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer comments
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

async function waitForColumn(key: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId: 'embed_sites' })
    const column = columns.find(c => (c as { key?: string }).key === key)
    if (column && (column as { status?: string }).status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Column ${key} wurde nicht 'available'`)
}

console.log(`Migration comments-012 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table embed_sites', () => tablesDB.createTable({
  databaseId, tableId: 'embed_sites', name: 'Embed Sites', rowSecurity: false, permissions: [],
}))
await step('Column embed_sites.host', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'embed_sites', key: 'host', size: 253, required: true,
}))
await step('Column embed_sites.label', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'embed_sites', key: 'label', size: 120, required: false, xdefault: '',
}))
await step('Column embed_sites.targetTypes', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'embed_sites', key: 'targetTypes', size: 64, required: false, array: true,
}))
await step('Column embed_sites.active', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'embed_sites', key: 'active', required: false, xdefault: true,
}))
await waitForColumn('host')
await step('Unique-Index embed_sites.uq_host', () => tablesDB.createIndex({
  databaseId, tableId: 'embed_sites', key: 'uq_host', type: TablesDBIndexType.Unique, columns: ['host'],
}))

console.log('✔ Migration comments-012 fertig')
