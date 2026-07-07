/**
 * Migration events-001: events + event_rsvps (Phase 22).
 *
 * rowSecurity = true: published/cancelled-Rows tragen read("any") (drafts
 * nicht — die Verwaltung liest über den Admin-Client). Geschrieben wird
 * AUSSCHLIESSLICH server-seitig (events.manage-Routen bzw. RSVP-Route mit
 * Admin-Client) — die Tables bekommen deshalb KEINE create/update-Permissions.
 * event_rsvps ohne breite Read-Permission (Lehre comment_votes/poll_votes) —
 * die eigene RSVP liefert die API. Idempotent (409 → skip). Aufruf über den
 * Runner:
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

/**
 * Vorhandene Column-Keys VOR dem Anlegen prüfen: Appwrite macht bei großen
 * Varchar-Spalten (description 10000) den Row-Size-Check VOR dem Duplikat-
 * Check und wirft dann 400 column_limit_exceeded statt 409 (MariaDB,
 * Muster posts-001/comments-002).
 */
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

console.log(`Migration events-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table events', () => tablesDB.createTable({
  databaseId, tableId: 'events', name: 'Events',
  // Nur der Server schreibt (events.manage/RSVP via Admin-Client); Lesen
  // regeln die ROW-Permissions (published/cancelled: read any)
  permissions: [], rowSecurity: true,
}))
const eventCols = await existingColumnKeys('events')
await columnStep('Column events.title', 'title', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'title', size: 200, required: true,
}))
await columnStep('Column events.description', 'description', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'description', size: 10000, required: true,
}))
await columnStep('Column events.startAt', 'startAt', eventCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'events', key: 'startAt', required: true,
}))
await columnStep('Column events.endAt', 'endAt', eventCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'events', key: 'endAt', required: false,
}))
await columnStep('Column events.location', 'location', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'location', size: 255, required: false,
}))
await columnStep('Column events.url', 'url', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'url', size: 500, required: false,
}))
await columnStep('Column events.capacity', 'capacity', eventCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'events', key: 'capacity', required: false, min: 1,
}))
await columnStep('Column events.attendeeCount', 'attendeeCount', eventCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'events', key: 'attendeeCount', required: false, min: 0, xdefault: 0,
}))
await columnStep('Column events.status', 'status', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'status', size: 12, required: true,
}))
await columnStep('Column events.organizerId', 'organizerId', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'organizerId', size: 36, required: true,
}))
await columnStep('Column events.organizerName', 'organizerName', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'organizerName', size: 255, required: false, xdefault: '',
}))

await step('Table event_rsvps', () => tablesDB.createTable({
  databaseId, tableId: 'event_rsvps', name: 'Event RSVPs', permissions: [], rowSecurity: true,
}))
const rsvpCols = await existingColumnKeys('event_rsvps')
await columnStep('Column event_rsvps.eventId', 'eventId', rsvpCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'event_rsvps', key: 'eventId', size: 36, required: true,
}))
await columnStep('Column event_rsvps.userId', 'userId', rsvpCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'event_rsvps', key: 'userId', size: 36, required: true,
}))
await columnStep('Column event_rsvps.status', 'status', rsvpCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'event_rsvps', key: 'status', size: 8, required: true,
}))

await waitForColumns('events')
await waitForColumns('event_rsvps')

await step('Index events.idx_start', () => tablesDB.createIndex({
  databaseId, tableId: 'events', key: 'idx_start', type: TablesDBIndexType.Key, columns: ['startAt'],
}))
await step('Index events.idx_status', () => tablesDB.createIndex({
  databaseId, tableId: 'events', key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'],
}))
// Kombi-Index für die Listen-Query (status = published AND startAt >= now)
await step('Index events.idx_status_start', () => tablesDB.createIndex({
  databaseId, tableId: 'events', key: 'idx_status_start', type: TablesDBIndexType.Key, columns: ['status', 'startAt'],
}))
await step('Index event_rsvps.uq_event_user', () => tablesDB.createIndex({
  databaseId, tableId: 'event_rsvps', key: 'uq_event_user', type: TablesDBIndexType.Unique, columns: ['eventId', 'userId'],
}))
// GDPR-Lookup (Export/Löschung per userId)
await step('Index event_rsvps.idx_user', () => tablesDB.createIndex({
  databaseId, tableId: 'event_rsvps', key: 'idx_user', type: TablesDBIndexType.Key, columns: ['userId'],
}))

console.log('✔ Migration events-001 fertig')
