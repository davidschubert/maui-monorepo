/**
 * Migration events-003: Feinschliff-Paket (2026-07-07).
 *
 * AUSSCHLIESSLICH additiv:
 * - events: address/locationNotes (Offline-Anfahrt), upvotes/downvotes/score
 *   (denormalisiert, NUR Server-Recount schreibt), Fulltext-Index auf title
 *   (Suche ?q).
 * - Table event_votes (Muster post_votes): User schreiben ihre Vote-Row
 *   selbst (create(users) + Row-Permissions), Unique eventId+userId,
 *   idx_user für GDPR.
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer events
 */
import { Client, Permission, Role, TablesDB, TablesDBIndexType } from 'node-appwrite'

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

console.log(`Migration events-003 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const eventCols = await existingColumnKeys('events')
await columnStep('Column events.address', 'address', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'address', size: 255, required: false,
}))
await columnStep('Column events.locationNotes', 'locationNotes', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'locationNotes', size: 1000, required: false,
}))
await columnStep('Column events.upvotes', 'upvotes', eventCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'events', key: 'upvotes', required: false, min: 0, xdefault: 0,
}))
await columnStep('Column events.downvotes', 'downvotes', eventCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'events', key: 'downvotes', required: false, min: 0, xdefault: 0,
}))
await columnStep('Column events.score', 'score', eventCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'events', key: 'score', required: false, xdefault: 0,
}))

await step('Table event_votes', () => tablesDB.createTable({
  databaseId, tableId: 'event_votes', name: 'Event Votes',
  // Eingeloggte legen ihre Vote-Row selbst an (Muster post_votes) —
  // Row-Permissions beschränken auf den eigenen User
  permissions: [Permission.create(Role.users())], rowSecurity: true,
}))
const voteCols = await existingColumnKeys('event_votes')
await columnStep('Column event_votes.eventId', 'eventId', voteCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'event_votes', key: 'eventId', size: 36, required: true,
}))
await columnStep('Column event_votes.userId', 'userId', voteCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'event_votes', key: 'userId', size: 36, required: true,
}))
await columnStep('Column event_votes.value', 'value', voteCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'event_votes', key: 'value', required: true, min: -1, max: 1,
}))

await waitForColumns('events')
await waitForColumns('event_votes')

// Suche (?q): Query.search braucht einen Fulltext-Index
await step('Index events.idx_title_search', () => tablesDB.createIndex({
  databaseId, tableId: 'events', key: 'idx_title_search', type: TablesDBIndexType.Fulltext, columns: ['title'],
}))
await step('Index event_votes.uq_event_user', () => tablesDB.createIndex({
  databaseId, tableId: 'event_votes', key: 'uq_event_user', type: TablesDBIndexType.Unique, columns: ['eventId', 'userId'],
}))
await step('Index event_votes.idx_user', () => tablesDB.createIndex({
  databaseId, tableId: 'event_votes', key: 'idx_user', type: TablesDBIndexType.Key, columns: ['userId'],
}))

console.log('✔ Migration events-003 fertig')
