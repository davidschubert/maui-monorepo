/**
 * Migration control-032: E10 — zentrales Kunden-Feedback im Control Plane.
 *
 * Davids Auftrag (docs/plans/CUSTOMER-FEEDBACK.md): was auf irgendeiner
 * Community- oder Website-Seite in den Feedback-Knopf getippt wird, läuft
 * ZENTRAL beim Betreiber auf. Deshalb liegen die Zeilen HIER und nirgends
 * sonst — es gibt eine Wahrheit, keine Spiegelzeile (Entscheidung 1).
 *
 * Vier Tabellen:
 *   - `customer_feedback`          — der Eintrag samt Herkunft und Zählern
 *   - `customer_feedback_votes`    — eine Stimme pro Person (Entscheidung 3)
 *   - `customer_feedback_comments` — Mitreden (Entscheidung „Mitreden")
 *   - `customer_feedback_mutes`    — Notbremse pro Community (Entscheidung 8)
 *
 * KEINE Row-Permissions, `permissions: []`: gelesen und geschrieben wird
 * ausschließlich server-seitig durch das Control Plane (Service-Naht mit
 * Secret + geprüftem Appwrite-JWT). Ein Browser hat in diesem Projekt weder
 * Session noch Leserecht — genau das ist die Wand, um die herum Entscheidung 1
 * gebaut wurde. Die Sichtbarkeitsregel („Text für alle, Herkunft nur für den
 * Betreiber") ist deshalb eine PROJEKTION im Code
 * (control/shared/customerFeedback.ts), keine Datenbank-Permission.
 *
 * WARUM DIE STUMMSCHALTUNG EINE EIGENE TABELLE IST und kein Feld an
 * `communities`: `createRow<TenantRow>` verlangt ALLE Spalten explizit
 * (CLAUDE.md) — ein weiteres Feld dort zwingt beide Anlegestellen zu einer
 * Änderung und die Migration vor jeden Code-Deploy. Die Stummschaltung ist
 * außerdem eine Aussage ÜBER DAS FEEDBACK-PRODUKT, nicht über die Community;
 * sie gehört zu diesen Tabellen. Die Row-Id IST die communityId, damit
 * Stummschalten idempotent ist und Aufheben ein Löschen genau einer Zeile.
 *
 * ADDITIV, IDEMPOTENT (409 → skip), nichts Zerstörerisches.
 *
 *   pnpm migrate --app control --layer control
 */
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { indexStep } from '../../../../scripts/migrations-lib/indexRetry.mts'

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

const db = databaseId
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

const FEEDBACK = 'customer_feedback'
const VOTES = 'customer_feedback_votes'
const COMMENTS = 'customer_feedback_comments'
const MUTES = 'customer_feedback_mutes'

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

/** Vorhandene Spalten EINER Table — immer mit explizitem Limit (Default 25). */
async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId, queries: [Query.limit(200)] })
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

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId, queries: [Query.limit(200)] })
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration control-032 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

// ── customer_feedback ──────────────────────────────────────────────────────

await step(`Table ${FEEDBACK}`, () => tablesDB.createTable({
  databaseId: db, tableId: FEEDBACK, name: 'Customer Feedback', permissions: [], rowSecurity: false,
}))
const feedbackCols = await existingColumnKeys(FEEDBACK)

await columnStep(`Column ${FEEDBACK}.area`, 'area', feedbackCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: FEEDBACK, key: 'area', size: 16, required: true,
}))
// Produkt-Key aus dem BESTEHENDEN Katalog (Entscheidung 5) — '' außer bei
// area 'product'. Bewusst kein Enum: der Katalog wächst mit jedem Layer, eine
// Enum-Spalte müsste dafür migriert werden.
await columnStep(`Column ${FEEDBACK}.productKey`, 'productKey', feedbackCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: FEEDBACK, key: 'productKey', size: 32, required: false, xdefault: '',
}))
await columnStep(`Column ${FEEDBACK}.title`, 'title', feedbackCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: FEEDBACK, key: 'title', size: 120, required: true,
}))
await columnStep(`Column ${FEEDBACK}.message`, 'message', feedbackCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: FEEDBACK, key: 'message', size: 2000, required: true,
}))
await columnStep(`Column ${FEEDBACK}.state`, 'state', feedbackCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: FEEDBACK, key: 'state', size: 16, required: true,
}))
// Moderations-Zustand (Entscheidung 8): 'visible' | 'hidden' — verstecken
// statt löschen, wie bei Kommentaren.
await columnStep(`Column ${FEEDBACK}.status`, 'status', feedbackCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: FEEDBACK, key: 'status', size: 12, required: true,
}))
await columnStep(`Column ${FEEDBACK}.page`, 'page', feedbackCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: FEEDBACK, key: 'page', size: 300, required: false, xdefault: '',
}))
// HERKUNFT — sie ist der halbe Zweck des Vorhabens (Rückfragen stellen,
// Nachverfolgung ermöglichen) und gleichzeitig das, was NIE an andere Kunden
// geht: die Projektion gibt sie nur dem Betreiber heraus.
await columnStep(`Column ${FEEDBACK}.communityId`, 'communityId', feedbackCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: FEEDBACK, key: 'communityId', size: 36, required: false, xdefault: '',
}))
await columnStep(`Column ${FEEDBACK}.communityName`, 'communityName', feedbackCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: FEEDBACK, key: 'communityName', size: 120, required: false, xdefault: '',
}))
await columnStep(`Column ${FEEDBACK}.runtimeProjectId`, 'runtimeProjectId', feedbackCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: FEEDBACK, key: 'runtimeProjectId', size: 36, required: false, xdefault: '',
}))
await columnStep(`Column ${FEEDBACK}.authorUserId`, 'authorUserId', feedbackCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: FEEDBACK, key: 'authorUserId', size: 36, required: false, xdefault: '',
}))
await columnStep(`Column ${FEEDBACK}.authorName`, 'authorName', feedbackCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: FEEDBACK, key: 'authorName', size: 128, required: false, xdefault: '',
}))
// Kontaktmöglichkeit bei Rückfragen — NUR für eingeloggte Absender gefüllt
// (Entscheidung 4: ohne Login heißt wirklich anonym, es gibt dann keine
// Adresse und keine Nachverfolgung).
await columnStep(`Column ${FEEDBACK}.authorEmail`, 'authorEmail', feedbackCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: FEEDBACK, key: 'authorEmail', size: 255, required: false, xdefault: '',
}))
await columnStep(`Column ${FEEDBACK}.voteCount`, 'voteCount', feedbackCols, () => tablesDB.createIntegerColumn({
  databaseId: db, tableId: FEEDBACK, key: 'voteCount', required: false, xdefault: 0,
}))
// „aus N Communities" (Entscheidung 3): die ZWEITE Zahl neben den Stimmen —
// Breite und Lautstärke stehen nebeneinander, statt die Stimmenlogik zu
// verbiegen.
await columnStep(`Column ${FEEDBACK}.communityCount`, 'communityCount', feedbackCols, () => tablesDB.createIntegerColumn({
  databaseId: db, tableId: FEEDBACK, key: 'communityCount', required: false, xdefault: 0,
}))
await columnStep(`Column ${FEEDBACK}.commentCount`, 'commentCount', feedbackCols, () => tablesDB.createIntegerColumn({
  databaseId: db, tableId: FEEDBACK, key: 'commentCount', required: false, xdefault: 0,
}))
await columnStep(`Column ${FEEDBACK}.lastVoteAt`, 'lastVoteAt', feedbackCols, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: FEEDBACK, key: 'lastVoteAt', required: false,
}))

await waitForColumns(FEEDBACK)

// Filtern nach Zustand (Roadmap-Spalten + Listen-Filter) und Sichtbarkeit.
await indexStep(`Index ${FEEDBACK}.idx_state`, () => tablesDB.createIndex({
  databaseId: db, tableId: FEEDBACK, key: 'idx_state', type: TablesDBIndexType.Key, columns: ['status', 'state'],
}))
// „Top" sortiert nach Stimmen.
await indexStep(`Index ${FEEDBACK}.idx_votes`, () => tablesDB.createIndex({
  databaseId: db, tableId: FEEDBACK, key: 'idx_votes', type: TablesDBIndexType.Key, columns: ['voteCount'],
}))
// Betreiber-Sicht „woher kam das?" + Stummschalten einer Community.
await indexStep(`Index ${FEEDBACK}.idx_community`, () => tablesDB.createIndex({
  databaseId: db, tableId: FEEDBACK, key: 'idx_community', type: TablesDBIndexType.Key, columns: ['communityId'],
}))
// DSGVO-Auskunft/-Löschung: alle Zeilen EINES Nutzers eines Projekts.
await indexStep(`Index ${FEEDBACK}.idx_author`, () => tablesDB.createIndex({
  databaseId: db, tableId: FEEDBACK, key: 'idx_author', type: TablesDBIndexType.Key, columns: ['runtimeProjectId', 'authorUserId'],
}))
// Volltext für die Sichtung (gleiches Muster wie feedback-002 früher).
await indexStep(`Index ${FEEDBACK}.idx_message_search`, () => tablesDB.createIndex({
  databaseId: db, tableId: FEEDBACK, key: 'idx_message_search', type: TablesDBIndexType.Fulltext, columns: ['message'],
}))

// ── customer_feedback_votes ────────────────────────────────────────────────

await step(`Table ${VOTES}`, () => tablesDB.createTable({
  databaseId: db, tableId: VOTES, name: 'Customer Feedback Votes', permissions: [], rowSecurity: false,
}))
const voteCols = await existingColumnKeys(VOTES)

await columnStep(`Column ${VOTES}.feedbackId`, 'feedbackId', voteCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: VOTES, key: 'feedbackId', size: 36, required: true,
}))
// `<runtimeProjectId>:<userId>` — dieselbe User-Id in zwei Appwrite-Projekten
// sind zwei verschiedene Menschen; ohne Präfix könnte eine Silo-Instanz die
// Stimme eines Pool-Nutzers überschreiben.
await columnStep(`Column ${VOTES}.voterKey`, 'voterKey', voteCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: VOTES, key: 'voterKey', size: 96, required: true,
}))
await columnStep(`Column ${VOTES}.communityId`, 'communityId', voteCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: VOTES, key: 'communityId', size: 36, required: false, xdefault: '',
}))

await waitForColumns(VOTES)

// EINE Stimme pro Person und Eintrag — die Regel steht in der Datenbank, nicht
// nur im Code: zwei gleichzeitige Klicks aus zwei Tabs enden sonst in zwei Zeilen.
await indexStep(`Index ${VOTES}.uq_feedback_voter`, () => tablesDB.createIndex({
  databaseId: db, tableId: VOTES, key: 'uq_feedback_voter', type: TablesDBIndexType.Unique,
  columns: ['feedbackId', 'voterKey'],
}))
// „aus wie vielen Communities?" zählt über diesen Zugriff.
await indexStep(`Index ${VOTES}.idx_feedback_community`, () => tablesDB.createIndex({
  databaseId: db, tableId: VOTES, key: 'idx_feedback_community', type: TablesDBIndexType.Key,
  columns: ['feedbackId', 'communityId'],
}))
// DSGVO-Löschung: alle Stimmen EINER Person.
await indexStep(`Index ${VOTES}.idx_voter`, () => tablesDB.createIndex({
  databaseId: db, tableId: VOTES, key: 'idx_voter', type: TablesDBIndexType.Key, columns: ['voterKey'],
}))

// ── customer_feedback_comments ─────────────────────────────────────────────

await step(`Table ${COMMENTS}`, () => tablesDB.createTable({
  databaseId: db, tableId: COMMENTS, name: 'Customer Feedback Comments', permissions: [], rowSecurity: false,
}))
const commentCols = await existingColumnKeys(COMMENTS)

await columnStep(`Column ${COMMENTS}.feedbackId`, 'feedbackId', commentCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: COMMENTS, key: 'feedbackId', size: 36, required: true,
}))
await columnStep(`Column ${COMMENTS}.body`, 'body', commentCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: COMMENTS, key: 'body', size: 1000, required: true,
}))
await columnStep(`Column ${COMMENTS}.status`, 'status', commentCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: COMMENTS, key: 'status', size: 12, required: true,
}))
await columnStep(`Column ${COMMENTS}.authorUserId`, 'authorUserId', commentCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: COMMENTS, key: 'authorUserId', size: 36, required: true,
}))
await columnStep(`Column ${COMMENTS}.authorName`, 'authorName', commentCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: COMMENTS, key: 'authorName', size: 128, required: false, xdefault: '',
}))
await columnStep(`Column ${COMMENTS}.communityId`, 'communityId', commentCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: COMMENTS, key: 'communityId', size: 36, required: false, xdefault: '',
}))
await columnStep(`Column ${COMMENTS}.runtimeProjectId`, 'runtimeProjectId', commentCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: COMMENTS, key: 'runtimeProjectId', size: 36, required: false, xdefault: '',
}))

await waitForColumns(COMMENTS)

await indexStep(`Index ${COMMENTS}.idx_feedback`, () => tablesDB.createIndex({
  databaseId: db, tableId: COMMENTS, key: 'idx_feedback', type: TablesDBIndexType.Key, columns: ['feedbackId'],
}))
await indexStep(`Index ${COMMENTS}.idx_author`, () => tablesDB.createIndex({
  databaseId: db, tableId: COMMENTS, key: 'idx_author', type: TablesDBIndexType.Key,
  columns: ['runtimeProjectId', 'authorUserId'],
}))

// ── customer_feedback_mutes ────────────────────────────────────────────────

await step(`Table ${MUTES}`, () => tablesDB.createTable({
  databaseId: db, tableId: MUTES, name: 'Customer Feedback Mutes', permissions: [], rowSecurity: false,
}))
const muteCols = await existingColumnKeys(MUTES)

// Redundant zur Row-Id, aber lesbar in der Appwrite-Konsole — und die Konsole
// ist im Zweifel das Werkzeug, mit dem jemand um 3 Uhr nachts nachsieht.
await columnStep(`Column ${MUTES}.communityId`, 'communityId', muteCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: MUTES, key: 'communityId', size: 36, required: true,
}))
await columnStep(`Column ${MUTES}.communityName`, 'communityName', muteCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: MUTES, key: 'communityName', size: 120, required: false, xdefault: '',
}))
await columnStep(`Column ${MUTES}.mutedBy`, 'mutedBy', muteCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: MUTES, key: 'mutedBy', size: 36, required: false, xdefault: '',
}))

await waitForColumns(MUTES)

console.log('✔ Migration control-032 fertig — additiv, vier Tabellen.')
