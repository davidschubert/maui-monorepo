/**
 * Migration events-006: `tenantId` auf allen vier events-Tabellen.
 *
 * WARUM: events geht durch die mandantensichere Datentür (core tenantDb) und
 * zieht damit in den Pool ein (Entscheidung 8, DECISION-LOG 2026-07-27:
 * „Events zuerst durch die Datentür"). Die Tür filtert und stempelt über die
 * tenantId-Spalte — ohne Spalte keine Tür (Muster posts-004).
 *
 * Rein ADDITIV und ruhend: '' / fehlend = Silo-/Einzelbetrieb (comments-App
 * unverändert — dort gibt es keinen Tenant-Kontext, die Tür scopet nicht).
 * Im Pool stempelt die Tür den Mandanten und filtert darauf. BESTAND ohne
 * tenantId wird im Pool nicht gefunden (fail-closed, dieselbe Regel wie
 * posts-004/rowBelongsToTenant); auf der Pool-Instanz existieren heute keine
 * events-Rows, ein Backfill wäre Theater.
 *
 * Unique-Indizes (uq_event_user auf rsvps/votes/tickets) bleiben BEWUSST ohne
 * tenantId: `eventId` ist eine global eindeutige Row-Id — anders als host
 * (comments-015) oder slug (pages-004) kann derselbe Schlüssel nie in zwei
 * Mandanten kollidieren. Dieselbe Entscheidung wie posts-004 (uq_post_user).
 *
 * Key-Indizes tragen die häufigsten Tür-Abfragen, führend der Mandant:
 *   events:        status+startAt (öffentliche Liste) → idx_tenant_status_start
 *   event_rsvps:   eventId+userId (eigene RSVP)       → idx_tenant_rsvp
 *   event_votes:   eventId+userId (eigene Stimme)     → idx_tenant_vote
 *   event_tickets: eventId+userId (Ticket-Check)      → idx_tenant_ticket
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer events
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
async function waitForColumn(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    // Query.limit ist hier PFLICHT: events trägt >25 Spalten, der
    // listColumns-Default (25) würde tenantId nie zeigen — der Poll liefe
    // in den Timeout, obwohl die Spalte längst 'available' ist.
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId, queries: [Query.limit(200)] })
    const column = (columns as unknown as { key: string, status: string }[]).find(c => c.key === key)
    if (column?.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Spalte "${tableId}.${key}" wurde nicht verfügbar`)
}

console.log(`Migration events-006 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const TARGETS: { table: string, index: string, columns: string[] }[] = [
  { table: 'events', index: 'idx_tenant_status_start', columns: ['tenantId', 'status', 'startAt'] },
  { table: 'event_rsvps', index: 'idx_tenant_rsvp', columns: ['tenantId', 'eventId', 'userId'] },
  { table: 'event_votes', index: 'idx_tenant_vote', columns: ['tenantId', 'eventId', 'userId'] },
  { table: 'event_tickets', index: 'idx_tenant_ticket', columns: ['tenantId', 'eventId', 'userId'] },
]

for (const { table, index, columns } of TARGETS) {
  await step(`Column ${table}.tenantId`, () => tablesDB.createVarcharColumn({
    databaseId, tableId: table, key: 'tenantId', size: 36, required: false, xdefault: '',
  }))
  await waitForColumn(table, 'tenantId')
  await step(`Index ${table}.${index}`, () => tablesDB.createIndex({
    databaseId, tableId: table, key: index, type: TablesDBIndexType.Key, columns,
  }))
}

console.log('✔ Migration events-006 fertig')
