/**
 * Migration studio-014: `tenant_plans` — der EDITIERBARE Quota-Katalog des
 * Control Plane (Studio-Dashboard statt app.config-Deploy). Eine Row je
 * Plan-Key (free/pro/business), `limits` als JSON: { [kind]: { perDay, total } }.
 * Der platform-Resolver liest den Katalog CROSS-Projekt (rows.read-Key) und
 * legt die aufgelösten Limits in den TenantContext; app.config bleibt
 * Fallback für Instanzen ohne Katalog. Seed = die am 2026-07-23 beschlossenen
 * Zahlen (nur wenn die Row fehlt — bestehende Werte werden NIE überschrieben).
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app studio --layer studio
 */
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'

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
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId: 'tenant_plans' })
    const column = columns.find(c => (c as { key?: string }).key === key)
    if (column && (column as { status?: string }).status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Column tenant_plans.${key} wurde nicht 'available'`)
}

console.log(`Migration studio-014 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// Zugriff NUR über Studio-Admin-Routen (sites.manage) + den read-only
// Cross-Projekt-Key der platform — keine Table-Permissions.
await step('Table tenant_plans', () => tablesDB.createTable({
  databaseId, tableId: 'tenant_plans', name: 'Tenant Plans', rowSecurity: false, permissions: [],
}))
await step('Column tenant_plans.key', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tenant_plans', key: 'key', size: 20, required: true,
}))
await step('Column tenant_plans.limits', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tenant_plans', key: 'limits', size: 4000, required: true,
}))
await waitForColumn('key')
await waitForColumn('limits')
await step('Unique-Index tenant_plans.uq_key', () => tablesDB.createIndex({
  databaseId, tableId: 'tenant_plans', key: 'uq_key', type: TablesDBIndexType.Unique, columns: ['key'],
}))

// Seed: beschlossene Zahlen (2026-07-23) — nur fehlende Rows anlegen
const SEED: Record<string, object> = {
  free: { comments: { perDay: 200, total: 5_000 } },
  pro: { comments: { perDay: 1_000, total: 50_000 } },
  business: { comments: { perDay: 5_000, total: 250_000 } },
}
for (const [key, limits] of Object.entries(SEED)) {
  const existing = await tablesDB.listRows({
    databaseId, tableId: 'tenant_plans', queries: [Query.equal('key', key), Query.limit(1)],
  })
  if (existing.total > 0) {
    console.log(`↷ Seed '${key}' (existiert bereits — Werte unangetastet)`)
    continue
  }
  await tablesDB.createRow({
    databaseId, tableId: 'tenant_plans', rowId: key,
    data: { key, limits: JSON.stringify(limits) },
  })
  console.log(`✔ Seed '${key}'`)
}

console.log('✔ Migration studio-014 fertig')
