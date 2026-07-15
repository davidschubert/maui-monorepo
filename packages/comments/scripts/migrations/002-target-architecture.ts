/**
 * Migration 002: Umbau auf die reddit-comment-system-setup Spec.
 *
 * comments: targetId+targetType statt postId, content (max 10.000) statt text,
 * denormalisierte Zähler (upvotes/downvotes/score), status-Workflow
 * active/reported/hidden/deleted. comment_votes unverändert neu aufgebaut.
 *
 * ⚠️ DROP + CREATE nur beim ERST-Umbau (altes postId-Schema → Ziel) — Dev-Daten
 * gehen verloren (mit Phase-10-Demo-Daten abgestimmt).
 * destruktiv-ok: DROP feuert ausschließlich bei POSITIV nachgewiesenem
 * Alt-Schema (Legacy-Spalte postId/text vorhanden); comment_votes nur im
 * Verbund (Rows referenzieren die gedroppten comments). Ein unvollständiges
 * ZIEL-Schema (z. B. nach Teil-Fehlschlag) droppt NIE — fehlende Spalten
 * ergänzt columnStep additiv (M3-Audit, additiv-sicher auf befüllter Instanz).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/comments/scripts/migrations/002-target-architecture.ts
 *
 * Benötigte Key-Scopes: tables.*, columns.*, indexes.* (Migrations-Key, siehe A2).
 */
import { Client, TablesDB, Permission, Role } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

// Migrations laufen mit dem separaten Migrations-Key (Konzept A2)
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY. Empfohlen: separater Migrations-Key (Konzept A2).')
}

if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — Script mit --env-file=apps/<app>/.env aufrufen.')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)

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

async function dropTable(tableId: string) {
  try {
    await tablesDB.deleteTable({ databaseId: databaseId!, tableId })
    console.log(`✘ Table ${tableId} entfernt (Schema-Umbau)`)
  }
  catch (error) {
    if (hasCode(error, 404)) {
      console.log(`↷ Table ${tableId} existiert nicht`)
      return
    }
    throw error
  }
}

/**
 * Vorhandene Column-Keys einer Table (leer bei 404/nicht existent).
 * Basis für Idempotenz: existierende Spalten werden GAR NICHT ERST angelegt —
 * das 409-Fangnetz reicht nicht, weil Appwrite bei großen varchar-Spalten den
 * Row-Size-Check VOR dem Duplikat-Check macht und dann 400 `column_limit_
 * exceeded` statt 409 wirft (auf MariaDB verifiziert, `content` varchar 10000).
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

/** Spalte nur anlegen, wenn sie fehlt (s. existingColumnKeys). */
async function columnStep(label: string, key: string, existing: Set<string>, run: () => Promise<unknown>) {
  if (existing.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  await step(label, run)
}

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration 002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// --- comments: drop NUR beim Erst-Umbau (Alt-Schema POSITIV erkannt) --------
// M3-Audit-Fix: Die frühere „beide am Ziel?"-Prüfung koppelte beide Tables per
// UND — ein halbes Zielschema (Teil-Fehlschlag) hätte die GESUNDE, befüllte
// Table mitgerissen. Jetzt gilt: gedroppt wird ausschließlich, wenn eine
// Legacy-Spalte (postId/text) die Alt-Architektur beweist; comment_votes nur
// im Verbund (ihre Rows referenzieren die gedroppten comments — Schema selbst
// war unverändert). Fehlende ZIEL-Spalten ergänzt columnStep unten additiv.
const commentKeys = await existingColumnKeys('comments')
const commentsIsLegacy = commentKeys.has('postId') || commentKeys.has('text')

if (commentsIsLegacy) {
  console.log('⚠ Alt-Schema (postId/text) erkannt — Erst-Umbau: comments + comment_votes werden neu aufgebaut.')
  await dropTable('comments')
  await dropTable('comment_votes')
}
else {
  console.log('↷ Kein Alt-Schema erkannt — DROP übersprungen; Tables/Spalten/Indizes werden idempotent sichergestellt.')
}

await step('Table comments', () => tablesDB.createTable({
  databaseId,
  tableId: 'comments',
  name: 'Comments',
  // KEIN Table-read(any): Lesen steuern die Rows (read(any) nur auf nicht-
  // hidden Rows — Migration 008), sonst wären hidden-Kommentare per Roh-REST
  // lesbar. Realtime für Gäste funktioniert über die Row-Permission.
  permissions: [Permission.create(Role.users())],
  rowSecurity: true,
}))

const commentCols = await existingColumnKeys('comments')
await columnStep('Column comments.targetId', 'targetId', commentCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'targetId', size: 255, required: true,
}))
await columnStep('Column comments.targetType', 'targetType', commentCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'targetType', size: 64, required: true,
}))
await columnStep('Column comments.content', 'content', commentCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'content', size: 10000, required: true,
}))
await columnStep('Column comments.authorId', 'authorId', commentCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'authorId', size: 255, required: true,
}))
await columnStep('Column comments.authorName', 'authorName', commentCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'authorName', size: 255, required: true,
}))
await columnStep('Column comments.parentId', 'parentId', commentCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'parentId', size: 255, required: false,
}))
await columnStep('Column comments.upvotes', 'upvotes', commentCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'comments', key: 'upvotes', required: false, min: 0, xdefault: 0,
}))
await columnStep('Column comments.downvotes', 'downvotes', commentCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'comments', key: 'downvotes', required: false, min: 0, xdefault: 0,
}))
await columnStep('Column comments.score', 'score', commentCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'comments', key: 'score', required: false, xdefault: 0,
}))
await columnStep('Column comments.status', 'status', commentCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'status', size: 16, required: false, xdefault: 'active',
}))

await waitForColumns('comments')

await step('Index comments.target', () => tablesDB.createIndex({
  databaseId, tableId: 'comments', key: 'target', type: 'key', columns: ['targetId', 'targetType'],
}))
await step('Index comments.parentId', () => tablesDB.createIndex({
  databaseId, tableId: 'comments', key: 'parent', type: 'key', columns: ['parentId'],
}))
await step('Index comments.score', () => tablesDB.createIndex({
  databaseId, tableId: 'comments', key: 'score', type: 'key', columns: ['score'],
}))
await step('Index comments.status', () => tablesDB.createIndex({
  databaseId, tableId: 'comments', key: 'status', type: 'key', columns: ['status'],
}))

// --- comment_votes ----------------------------------------------------------
await step('Table comment_votes', () => tablesDB.createTable({
  databaseId,
  tableId: 'comment_votes',
  name: 'Comment Votes',
  // KEIN Table-read(users): Votes sind nicht öffentlich — Rows tragen
  // read(user:self), der Server liest mit dem Admin-Client (Migration 007).
  permissions: [Permission.create(Role.users())],
  rowSecurity: true,
}))

const voteCols = await existingColumnKeys('comment_votes')
await columnStep('Column comment_votes.commentId', 'commentId', voteCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comment_votes', key: 'commentId', size: 255, required: true,
}))
await columnStep('Column comment_votes.userId', 'userId', voteCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comment_votes', key: 'userId', size: 255, required: true,
}))
await columnStep('Column comment_votes.value', 'value', voteCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'comment_votes', key: 'value', required: true, min: -1, max: 1,
}))

await waitForColumns('comment_votes')

await step('Unique-Index comment_votes.commentId_userId', () => tablesDB.createIndex({
  databaseId, tableId: 'comment_votes', key: 'commentId_userId', type: 'unique', columns: ['commentId', 'userId'],
}))

console.log('Migration 002 abgeschlossen.')
