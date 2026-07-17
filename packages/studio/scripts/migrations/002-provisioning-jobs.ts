/**
 * Migration studio-002: Tables `provisioning_jobs` + `feature_catalog`
 * (M6-T2, Vorstufe Provisioner-Vertrag § 8). Beide ohne Client-Permissions —
 * gelesen/geschrieben wird server-seitig (sites.manage-Routen) bzw. vom
 * Job-Runner (Admin-Key). Additiv + idempotent (409 → skip).
 *
 * Zeilenbudget (MariaDB/utf8mb4, ~16k Zeichen je Row): log 8000 + payload
 * 2000 + result 1000 + Kleinspalten ≈ 11,3k — bewusst mit Headroom.
 * WICHTIG: Appwrite prüft die Zeilengröße VOR dem Duplikat-Check — an einem
 * vollen Table antwortet ein Re-Create 400 (column_limit_exceeded) statt
 * 409. Idempotenz läuft hier deshalb über listColumns-Inspektion, nicht
 * über 409-Skip; Bestandsinstanzen mit log=10000 werden per Update-Step
 * auf 8000 geschrumpft (Job-Logs sind gekürzte Tails, kein Datenverlust
 * über die Kürzung hinaus).
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

console.log(`Migration studio-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// ── provisioning_jobs ───────────────────────────────────────────────────────
await step('Table provisioning_jobs', () => tablesDB.createTable({
  databaseId, tableId: 'provisioning_jobs', name: 'Provisioning Jobs',
  permissions: [], // nur Server (sites.manage-Routen) + Runner (Admin-Key)
  rowSecurity: false,
}))

// Idempotenz per Inspektion (siehe Kopfkommentar: 400 statt 409 am vollen Table)
const existingJobColumns = new Map(
  (await tablesDB.listColumns({ databaseId, tableId: 'provisioning_jobs' })).columns
    .map(column => [column.key, column as unknown as { size?: number }]),
)

async function columnStep(key: string, create: () => Promise<unknown>) {
  if (existingJobColumns.has(key)) {
    console.log(`↷ Column provisioning_jobs.${key} (existiert bereits)`)
    return
  }
  await step(`Column provisioning_jobs.${key}`, create)
}

await columnStep('type', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'type', size: 32, required: true,
}))
await columnStep('payload', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'payload', size: 2000, required: true,
}))
await columnStep('status', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'status', size: 16, required: false, xdefault: 'queued',
}))
await columnStep('log', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'log', size: 8000, required: false, xdefault: '',
}))
await columnStep('result', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'result', size: 1000, required: false, xdefault: '',
}))
await columnStep('requestedBy', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'requestedBy', size: 64, required: false, xdefault: '',
}))
await columnStep('runnerId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'runnerId', size: 64, required: false, xdefault: '',
}))
await columnStep('startedAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'startedAt', required: false,
}))
await columnStep('finishedAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'provisioning_jobs', key: 'finishedAt', required: false,
}))

// Bestandsinstanzen: log von 10000 → 8000 schrumpfen (Headroom fürs Zeilenbudget).
// destruktiv-ok: updateVarcharColumn schrumpft NUR die log-Spalte und NUR wenn
// sie größer als 8000 ist; Job-Logs sind bereits gekürzte Tails (Runner-Limit
// 7500) — es gehen keine Daten über die ohnehin geltende Kürzung hinaus verloren.
const logColumn = existingJobColumns.get('log')
if (logColumn && (logColumn.size ?? 0) > 8000) {
  await step('Column provisioning_jobs.log auf 8000 schrumpfen', () => tablesDB.updateVarcharColumn({
    databaseId, tableId: 'provisioning_jobs', key: 'log', size: 8000, required: false, xdefault: '',
  }))
}

await waitForColumns('provisioning_jobs')

await step('Index provisioning_jobs.idx_status', () => tablesDB.createIndex({
  databaseId, tableId: 'provisioning_jobs', key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'],
}))

// ── feature_catalog (rowId = Feature-Key) ───────────────────────────────────
await step('Table feature_catalog', () => tablesDB.createTable({
  databaseId, tableId: 'feature_catalog', name: 'Feature Catalog',
  permissions: [], // nur Server; Sync schreibt der Job-Runner
  rowSecurity: false,
}))

await step('Column feature_catalog.tier', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feature_catalog', key: 'tier', size: 16, required: true,
}))
await step('Column feature_catalog.requires', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feature_catalog', key: 'requires', size: 400, required: false, xdefault: '[]',
}))
await step('Column feature_catalog.hasMigrations', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'feature_catalog', key: 'hasMigrations', required: false, xdefault: false,
}))
await step('Column feature_catalog.title', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feature_catalog', key: 'title', size: 400, required: true,
}))
await step('Column feature_catalog.description', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feature_catalog', key: 'description', size: 2000, required: true,
}))
await step('Column feature_catalog.icon', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feature_catalog', key: 'icon', size: 64, required: false, xdefault: '',
}))
await step('Column feature_catalog.syncedAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'feature_catalog', key: 'syncedAt', required: false,
}))

await waitForColumns('feature_catalog')

console.log('✔ Migration studio-002 fertig')
