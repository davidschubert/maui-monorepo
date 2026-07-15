/**
 * Migration events-005: Event-Serien (Plan EVENTS-V2 §7e) — ausschließlich
 * ADDITIV: recurrence (Master-Regel), seriesId/seriesIndex (Zugehörigkeit),
 * seriesUntil (hartes Serienende), seriesGeneratedUntil (Idempotenz-Marker
 * des Rolling-Window-Top-ups) + Index (seriesId, startAt). Idempotent.
 *
 *   pnpm migrate --app <app> --layer events
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
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}
async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    return new Set(columns.map(column => column.key))
  }
  catch (error) {
    // 404 → leere Menge (Table entsteht erst) — Angleichung an die
    // Schwester-Migrationen (M3-Audit-Nit)
    if (hasCode(error, 404)) return new Set()
    throw error
  }
}
async function columnStep(label: string, key: string, existing: Set<string>, run: () => Promise<unknown>) {
  if (existing.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  await step(label, run)
}

console.log(`Migration events-005 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const cols = await existingColumnKeys('events')
await columnStep('Column events.recurrence', 'recurrence', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'recurrence', size: 12, required: false, xdefault: '',
}))
await columnStep('Column events.seriesId', 'seriesId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'seriesId', size: 36, required: false, xdefault: '',
}))
await columnStep('Column events.seriesIndex', 'seriesIndex', cols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'events', key: 'seriesIndex', required: false, min: 0, max: 100_000, xdefault: 0,
}))
await columnStep('Column events.seriesUntil', 'seriesUntil', cols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'events', key: 'seriesUntil', required: false,
}))
await columnStep('Column events.seriesGeneratedUntil', 'seriesGeneratedUntil', cols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'events', key: 'seriesGeneratedUntil', required: false,
}))

await waitForColumns('events')

await step('Index events.idx_series', () => tablesDB.createIndex({
  databaseId, tableId: 'events', key: 'idx_series', type: TablesDBIndexType.Key, columns: ['seriesId', 'startAt'],
}))

console.log('✔ Migration events-005 fertig')
