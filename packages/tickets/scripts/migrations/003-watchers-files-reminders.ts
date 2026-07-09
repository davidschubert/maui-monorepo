/**
 * Migration tickets-003 (Plan P4): ticket_watchers + ticket_files als EIGENE
 * Tables (das Zeilenbudget der tickets-Table ist mit description 10000 nahezu
 * ausgeschöpft — JSON-Spalten wären geplatzt; außerdem braucht „Was beobachte
 * ich?" eine userId-Query). Dazu tickets.dueRemindedAt (Fälligkeits-Reminder,
 * Sweep-Muster events) + Index auf dueAt, und der Storage-Bucket
 * 'ticket-files' (Serving läuft ausschließlich über Server-Routen).
 * Idempotent (409 → skip).
 *
 *   pnpm migrate --app <app> --layer tickets
 */
import { Client, Permission, Role, Storage, TablesDB, TablesDBIndexType } from 'node-appwrite'

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

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)
const storage = new Storage(client)

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

console.log(`Migration tickets-003 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const OPERATOR_READ = [Permission.read(Role.label('admin')), Permission.read(Role.label('moderator'))]

// --- ticket_watchers -------------------------------------------------------
await step('Table ticket_watchers', () => tablesDB.createTable({
  databaseId, tableId: 'ticket_watchers', name: 'Ticket Watchers',
  permissions: OPERATOR_READ, rowSecurity: false,
}))
const watcherCols = await existingColumnKeys('ticket_watchers')
await columnStep('Column ticket_watchers.ticketId', 'ticketId', watcherCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'ticket_watchers', key: 'ticketId', size: 36, required: true,
}))
await columnStep('Column ticket_watchers.userId', 'userId', watcherCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'ticket_watchers', key: 'userId', size: 36, required: true,
}))
await columnStep('Column ticket_watchers.userName', 'userName', watcherCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'ticket_watchers', key: 'userName', size: 255, required: false, xdefault: '',
}))

// --- ticket_files ----------------------------------------------------------
await step('Table ticket_files', () => tablesDB.createTable({
  databaseId, tableId: 'ticket_files', name: 'Ticket Files',
  permissions: OPERATOR_READ, rowSecurity: false,
}))
const fileCols = await existingColumnKeys('ticket_files')
await columnStep('Column ticket_files.ticketId', 'ticketId', fileCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'ticket_files', key: 'ticketId', size: 36, required: true,
}))
await columnStep('Column ticket_files.fileId', 'fileId', fileCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'ticket_files', key: 'fileId', size: 36, required: true,
}))
await columnStep('Column ticket_files.name', 'name', fileCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'ticket_files', key: 'name', size: 255, required: true,
}))
await columnStep('Column ticket_files.mimeType', 'mimeType', fileCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'ticket_files', key: 'mimeType', size: 100, required: false, xdefault: '',
}))
await columnStep('Column ticket_files.size', 'size', fileCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'ticket_files', key: 'size', required: false, min: 0, max: 100_000_000, xdefault: 0,
}))
await columnStep('Column ticket_files.uploadedBy', 'uploadedBy', fileCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'ticket_files', key: 'uploadedBy', size: 36, required: false, xdefault: '',
}))

// --- tickets: Reminder-Spalte ---------------------------------------------
const ticketCols = await existingColumnKeys('tickets')
await columnStep('Column tickets.dueRemindedAt', 'dueRemindedAt', ticketCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'tickets', key: 'dueRemindedAt', required: false,
}))

await waitForColumns('ticket_watchers')
await waitForColumns('ticket_files')
await waitForColumns('tickets')

await step('Index ticket_watchers.uq_ticket_user', () => tablesDB.createIndex({
  databaseId, tableId: 'ticket_watchers', key: 'uq_ticket_user', type: TablesDBIndexType.Unique, columns: ['ticketId', 'userId'],
}))
await step('Index ticket_watchers.idx_user', () => tablesDB.createIndex({
  databaseId, tableId: 'ticket_watchers', key: 'idx_user', type: TablesDBIndexType.Key, columns: ['userId'],
}))
await step('Index ticket_files.idx_ticket', () => tablesDB.createIndex({
  databaseId, tableId: 'ticket_files', key: 'idx_ticket', type: TablesDBIndexType.Key, columns: ['ticketId'],
}))
await step('Index ticket_files.idx_file', () => tablesDB.createIndex({
  databaseId, tableId: 'ticket_files', key: 'idx_file', type: TablesDBIndexType.Key, columns: ['fileId'],
}))
await step('Index tickets.idx_due', () => tablesDB.createIndex({
  databaseId, tableId: 'tickets', key: 'idx_due', type: TablesDBIndexType.Key, columns: ['status', 'dueAt'],
}))

// --- Bucket ticket-files (Serving NUR über Server-Routen) ------------------
await step('Bucket ticket-files', () => storage.createBucket({
  bucketId: 'ticket-files', name: 'Ticket Files',
  permissions: [], fileSecurity: false,
  maximumFileSize: 10 * 1024 * 1024,
}))

console.log('✔ Migration tickets-003 fertig')
