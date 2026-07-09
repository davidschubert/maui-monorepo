/**
 * Migration tickets-001: ticket_lists + tickets (Plan: docs/plans/TICKETS-BOARD.md).
 *
 * rowSecurity = false; Table-Read für label:admin + label:moderator → die
 * geteilte JWT-SDK-Realtime liefert Operatoren Live-Updates. Writes laufen
 * AUSSCHLIESSLICH über Server-Routen (requirePermission tickets.manage).
 * Seedet die sieben Standard-Listen, wenn ticket_lists leer ist (Listen sind
 * Daten — umbenennbar/löschbar, keine Enum-Semantik). Idempotent (409 → skip).
 *
 *   pnpm migrate --app <app> --layer tickets
 */
import { Client, ID, Permission, Role, TablesDB, TablesDBIndexType } from 'node-appwrite'

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

console.log(`Migration tickets-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// Operator-Read (Realtime); Schreiben nur über Server-Routen (Admin-Client)
const OPERATOR_READ = [Permission.read(Role.label('admin')), Permission.read(Role.label('moderator'))]

await step('Table ticket_lists', () => tablesDB.createTable({
  databaseId, tableId: 'ticket_lists', name: 'Ticket Lists',
  permissions: OPERATOR_READ, rowSecurity: false,
}))
const listCols = await existingColumnKeys('ticket_lists')
await columnStep('Column ticket_lists.title', 'title', listCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'ticket_lists', key: 'title', size: 100, required: true,
}))
await columnStep('Column ticket_lists.position', 'position', listCols, () => tablesDB.createFloatColumn({
  databaseId, tableId: 'ticket_lists', key: 'position', required: true,
}))

await step('Table tickets', () => tablesDB.createTable({
  databaseId, tableId: 'tickets', name: 'Tickets',
  permissions: OPERATOR_READ, rowSecurity: false,
}))
const ticketCols = await existingColumnKeys('tickets')
await columnStep('Column tickets.listId', 'listId', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tickets', key: 'listId', size: 36, required: true,
}))
await columnStep('Column tickets.title', 'title', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tickets', key: 'title', size: 300, required: true,
}))
await columnStep('Column tickets.description', 'description', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tickets', key: 'description', size: 10000, required: false, xdefault: '',
}))
await columnStep('Column tickets.label', 'label', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tickets', key: 'label', size: 12, required: false, xdefault: '',
}))
await columnStep('Column tickets.priority', 'priority', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tickets', key: 'priority', size: 8, required: false, xdefault: '',
}))
await columnStep('Column tickets.effort', 'effort', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tickets', key: 'effort', size: 12, required: false, xdefault: '',
}))
await columnStep('Column tickets.startAt', 'startAt', ticketCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'tickets', key: 'startAt', required: false,
}))
await columnStep('Column tickets.dueAt', 'dueAt', ticketCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'tickets', key: 'dueAt', required: false,
}))
await columnStep('Column tickets.checklist', 'checklist', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tickets', key: 'checklist', size: 3000, required: false, xdefault: '',
}))
await columnStep('Column tickets.membersJson', 'membersJson', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tickets', key: 'membersJson', size: 800, required: false, xdefault: '',
}))
await columnStep('Column tickets.status', 'status', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tickets', key: 'status', size: 8, required: true,
}))
await columnStep('Column tickets.doneAt', 'doneAt', ticketCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'tickets', key: 'doneAt', required: false,
}))
await columnStep('Column tickets.position', 'position', ticketCols, () => tablesDB.createFloatColumn({
  databaseId, tableId: 'tickets', key: 'position', required: true,
}))
await columnStep('Column tickets.feedbackId', 'feedbackId', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tickets', key: 'feedbackId', size: 36, required: false, xdefault: '',
}))
await columnStep('Column tickets.createdBy', 'createdBy', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tickets', key: 'createdBy', size: 36, required: true,
}))
await columnStep('Column tickets.createdByName', 'createdByName', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tickets', key: 'createdByName', size: 255, required: false, xdefault: '',
}))

await waitForColumns('ticket_lists')
await waitForColumns('tickets')

await step('Index ticket_lists.idx_position', () => tablesDB.createIndex({
  databaseId, tableId: 'ticket_lists', key: 'idx_position', type: TablesDBIndexType.Key, columns: ['position'],
}))
await step('Index tickets.idx_list', () => tablesDB.createIndex({
  databaseId, tableId: 'tickets', key: 'idx_list', type: TablesDBIndexType.Key, columns: ['listId', 'position'],
}))
await step('Index tickets.idx_status', () => tablesDB.createIndex({
  databaseId, tableId: 'tickets', key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'],
}))

// Seed: Standard-Listen nur bei komplett leerer Tabelle (Listen sind Daten)
const existing = await tablesDB.listRows({ databaseId, tableId: 'ticket_lists', queries: [] })
if (existing.total === 0) {
  // „Neues Feedback" bewusst NICHT geseedet — Feedback bleibt in der
  // Feedback-Verwaltung und wird dort per Aktion in ein Ticket umgewandelt (P2)
  const DEFAULT_LISTS = [
    'Neue Tickets', 'Als nächstes dran', 'Jetzt im Gange',
    'Wartet auf Freigabe', 'Erledigt', 'Zurückgestellt',
  ]
  for (const [index, title] of DEFAULT_LISTS.entries()) {
    await step(`Seed Liste „${title}"`, () => tablesDB.createRow({
      databaseId, tableId: 'ticket_lists', rowId: ID.unique(),
      data: { title, position: (index + 1) * 1000 },
    }))
  }
}
else {
  console.log(`↷ Seed übersprungen — ticket_lists hat bereits ${existing.total} Liste(n)`)
}

console.log('✔ Migration tickets-001 fertig')
