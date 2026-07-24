/**
 * Migration pages-003: `pages.tenantId` — Horizont-3 Pool-Datenpfad
 * (Fläche 2, Blueprint Naht 3), spiegelt comments-011. Rein ADDITIV und
 * ruhend: '' / fehlend = Silo-/Einzelbetrieb (heutiges Verhalten). Im
 * Pool-Modus stempelt scopeRow() den Mandanten und scopeQuery() filtert
 * darauf — WICHTIG auch für Korrektheit: Pool-Tenants teilen sich den
 * slug-Namensraum (jeder hat z. B. 'home') — ohne Scope überschrieben sie sich.
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer pages
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
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId: 'pages' })
    const column = (columns as unknown as { key: string, status: string }[]).find(c => c.key === key)
    if (column?.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Spalte "${key}" wurde nicht verfügbar`)
}

console.log(`Migration pages-003 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Column pages.tenantId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'pages', key: 'tenantId', size: 36, required: false, xdefault: '',
}))
await waitForColumn('tenantId')
await step('Index pages.idx_tenant', () => tablesDB.createIndex({
  databaseId, tableId: 'pages', key: 'idx_tenant', type: TablesDBIndexType.Key, columns: ['tenantId'],
}))

console.log('✔ Migration pages-003 fertig')
