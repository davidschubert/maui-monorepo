/**
 * Migration feedback-001: Table feedback (Feedback-Widget).
 *
 * Geschrieben wird AUSSCHLIESSLICH server-seitig (POST-Route mit Admin-Client
 * — auch Gäste dürfen senden, gedrosselt über den Core-Bucket feedback:create);
 * gelesen nur über die feedback.manage-Routen. Rows tragen deshalb KEINE
 * Permissions. Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer feedback
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

console.log(`Migration feedback-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table feedback', () => tablesDB.createTable({
  databaseId, tableId: 'feedback', name: 'Feedback', permissions: [], rowSecurity: true,
}))
const cols = await existingColumnKeys('feedback')
await columnStep('Column feedback.category', 'category', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feedback', key: 'category', size: 8, required: true,
}))
await columnStep('Column feedback.message', 'message', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feedback', key: 'message', size: 2000, required: true,
}))
await columnStep('Column feedback.page', 'page', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feedback', key: 'page', size: 300, required: false, xdefault: '',
}))
await columnStep('Column feedback.userId', 'userId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feedback', key: 'userId', size: 36, required: false, xdefault: '',
}))
await columnStep('Column feedback.userName', 'userName', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feedback', key: 'userName', size: 255, required: false, xdefault: '',
}))
await columnStep('Column feedback.status', 'status', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'feedback', key: 'status', size: 12, required: true,
}))

await waitForColumns('feedback')

await step('Index feedback.idx_status', () => tablesDB.createIndex({
  databaseId, tableId: 'feedback', key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'],
}))
// GDPR-Lookup (Export/Löschung per userId)
await step('Index feedback.idx_user', () => tablesDB.createIndex({
  databaseId, tableId: 'feedback', key: 'idx_user', type: TablesDBIndexType.Key, columns: ['userId'],
}))

console.log('✔ Migration feedback-001 fertig')
