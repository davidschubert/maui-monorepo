/**
 * Migration 002: Umbau auf die reddit-comment-system-setup Spec.
 *
 * comments: targetId+targetType statt postId, content (max 10.000) statt text,
 * denormalisierte Zähler (upvotes/downvotes/score), status-Workflow
 * active/reported/hidden/deleted. comment_votes unverändert neu aufgebaut.
 *
 * ⚠️ DROP + CREATE — Dev-Daten gehen verloren (mit Phase-10-Demo-Daten abgestimmt).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/comments/scripts/migrations/002-target-architecture.ts
 *
 * Benötigte Key-Scopes: tables.*, columns.*, indexes.* (Migrations-Key, siehe A2).
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

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration 002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// --- comments: drop + neu nach Spec ----------------------------------------
await dropTable('comments')
await dropTable('comment_votes')

await step('Table comments', () => tablesDB.createTable({
  databaseId,
  tableId: 'comments',
  name: 'Comments',
  permissions: [Permission.read(Role.any()), Permission.create(Role.users())],
  rowSecurity: true,
}))

await step('Column comments.targetId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'targetId', size: 255, required: true,
}))
await step('Column comments.targetType', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'targetType', size: 64, required: true,
}))
await step('Column comments.content', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'content', size: 10000, required: true,
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
await step('Column comments.upvotes', () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'comments', key: 'upvotes', required: false, min: 0, xdefault: 0,
}))
await step('Column comments.downvotes', () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'comments', key: 'downvotes', required: false, min: 0, xdefault: 0,
}))
await step('Column comments.score', () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'comments', key: 'score', required: false, xdefault: 0,
}))
await step('Column comments.status', () => tablesDB.createVarcharColumn({
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

console.log('Migration 002 abgeschlossen.')
