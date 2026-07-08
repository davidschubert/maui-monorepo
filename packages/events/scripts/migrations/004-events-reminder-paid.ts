/**
 * Migration events-004: Phase 27 (Plan docs/plans/EVENTS-V2.md, E3+E4).
 *
 * AUSSCHLIESSLICH additiv:
 * - events: remindersSentAt (Idempotenz-Flag des Reminder-Sweeps),
 *   access free/paid, priceAmount (Cent, nur Anzeige — die Wahrheit lebt
 *   in Stripe), priceLookupKey (Stripe-Referenz, Muster BILLING-STRIPE B5).
 * - Table event_tickets im ENDSCHEMA — Phase 23 (Billing) muss NICHTS
 *   migrieren, nur den Guard registrieren und Tickets via grantEventTicket
 *   schreiben. Row-Security: read nur eigener User, Writes NUR Admin-Client.
 * Idempotent (409 → skip). Aufruf über den Runner:
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

console.log(`Migration events-004 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const eventCols = await existingColumnKeys('events')
await columnStep('Column events.remindersSentAt', 'remindersSentAt', eventCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'events', key: 'remindersSentAt', required: false,
}))
await columnStep('Column events.access', 'access', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'access', size: 8, required: false,
}))
await columnStep('Column events.priceAmount', 'priceAmount', eventCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'events', key: 'priceAmount', required: false, min: 0,
}))
await columnStep('Column events.priceLookupKey', 'priceLookupKey', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'priceLookupKey', size: 64, required: false,
}))

await step('Table event_tickets', () => tablesDB.createTable({
  databaseId, tableId: 'event_tickets', name: 'Event Tickets',
  // Writes NUR server-seitig (grantEventTicket via Admin-Client) —
  // die Row-Permission read(user:<id>) setzt grantEventTicket selbst
  permissions: [], rowSecurity: true,
}))
const ticketCols = await existingColumnKeys('event_tickets')
await columnStep('Column event_tickets.eventId', 'eventId', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'event_tickets', key: 'eventId', size: 36, required: true,
}))
await columnStep('Column event_tickets.userId', 'userId', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'event_tickets', key: 'userId', size: 36, required: true,
}))
await columnStep('Column event_tickets.status', 'status', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'event_tickets', key: 'status', size: 12, required: true,
}))
await columnStep('Column event_tickets.stripeSessionId', 'stripeSessionId', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'event_tickets', key: 'stripeSessionId', size: 255, required: false,
}))
await columnStep('Column event_tickets.amount', 'amount', ticketCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'event_tickets', key: 'amount', required: false, min: 0,
}))

await waitForColumns('events')
await waitForColumns('event_tickets')

await step('Index event_tickets.uq_event_user', () => tablesDB.createIndex({
  databaseId, tableId: 'event_tickets', key: 'uq_event_user', type: TablesDBIndexType.Unique, columns: ['eventId', 'userId'],
}))
// GDPR-Lookup (Export/Löschung per userId)
await step('Index event_tickets.idx_user', () => tablesDB.createIndex({
  databaseId, tableId: 'event_tickets', key: 'idx_user', type: TablesDBIndexType.Key, columns: ['userId'],
}))
// Reminder-Sweep-Query (status + startAt steht schon als idx_status_start;
// remindersSentAt wird per isNull gefiltert — kein eigener Index nötig bei
// der kleinen Kandidatenmenge <24h)

console.log('✔ Migration events-004 fertig')
