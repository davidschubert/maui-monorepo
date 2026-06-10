/**
 * Migration 001: comments + comment_votes Tables.
 *
 * Tables gehören zur APP-Instanz (Core besitzt null Tables!) — Aufruf daher
 * mit der .env der jeweiligen App, nie automatisch im Deploy:
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/comments/scripts/migrations/001-comments-tables.ts
 *
 * Benötigte Key-Scopes: tables.write, columns.write, indexes.write.
 * Idempotent: existierende Ressourcen (409) werden übersprungen.
 */
import { Client, TablesDB, Permission, Role } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — Script mit --env-file=apps/<app>/.env aufrufen.')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)

function isConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 409
}

async function step(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (isConflict(error)) {
      console.log(`↷ ${label} (existiert bereits)`)
      return
    }
    throw error
  }
}

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration 001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// --- comments ---------------------------------------------------------------
await step('Table comments', () => tablesDB.createTable({
  databaseId,
  tableId: 'comments',
  name: 'Comments',
  permissions: [Permission.read(Role.any()), Permission.create(Role.users())],
  rowSecurity: true,
}))

await step('Column comments.postId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'postId', size: 255, required: true,
}))
await step('Column comments.text', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'text', size: 2000, required: true,
}))
await step('Column comments.authorId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'authorId', size: 255, required: true,
}))
await step('Column comments.authorName', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'authorName', size: 255, required: true,
}))
await step('Column comments.parentId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'parentId', size: 255, required: false,
}))
await step('Column comments.status', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'status', size: 16, required: false, xdefault: 'visible',
}))

await waitForColumns('comments')

await step('Index comments.postId_status', () => tablesDB.createIndex({
  databaseId, tableId: 'comments', key: 'postId_status', type: 'key', columns: ['postId', 'status'],
}))

// --- comment_votes ----------------------------------------------------------
await step('Table comment_votes', () => tablesDB.createTable({
  databaseId,
  tableId: 'comment_votes',
  name: 'Comment Votes',
  permissions: [Permission.read(Role.users()), Permission.create(Role.users())],
  rowSecurity: true,
}))

await step('Column comment_votes.commentId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comment_votes', key: 'commentId', size: 255, required: true,
}))
await step('Column comment_votes.userId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comment_votes', key: 'userId', size: 255, required: true,
}))
await step('Column comment_votes.value', () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'comment_votes', key: 'value', required: true, min: -1, max: 1,
}))

await waitForColumns('comment_votes')

await step('Unique-Index comment_votes.commentId_userId', () => tablesDB.createIndex({
  databaseId, tableId: 'comment_votes', key: 'commentId_userId', type: 'unique', columns: ['commentId', 'userId'],
}))

console.log('Migration 001 abgeschlossen.')
