/**
 * Migration posts-001: community_posts + poll_votes (Phase 25).
 *
 * rowSecurity = true: published-Rows tragen read("any") (hidden/deleted/
 * scheduled verlieren bzw. bekommen sie nie); update/delete nur der Autor.
 * poll_votes OHNE breite Read-Permission (Lehre comment_votes) — die eigene
 * Stimme liefert die API. Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer posts
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
 * Varchar-Spalten (body 10000) den Row-Size-Check VOR dem Duplikat-Check und
 * wirft dann 400 column_limit_exceeded statt 409 (MariaDB, Muster comments-002).
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

console.log(`Migration posts-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table community_posts', () => tablesDB.createTable({
  databaseId, tableId: 'community_posts', name: 'Community Posts', permissions: [], rowSecurity: true,
}))
const postCols = await existingColumnKeys('community_posts')
await columnStep('Column community_posts.type', 'type', postCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'community_posts', key: 'type', size: 8, required: true,
}))
await columnStep('Column community_posts.title', 'title', postCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'community_posts', key: 'title', size: 200, required: false,
}))
await columnStep('Column community_posts.body', 'body', postCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'community_posts', key: 'body', size: 10000, required: true,
}))
await columnStep('Column community_posts.authorId', 'authorId', postCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'community_posts', key: 'authorId', size: 36, required: true,
}))
await columnStep('Column community_posts.authorName', 'authorName', postCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'community_posts', key: 'authorName', size: 255, required: false, xdefault: '',
}))
await columnStep('Column community_posts.status', 'status', postCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'community_posts', key: 'status', size: 12, required: true,
}))
await columnStep('Column community_posts.scheduledAt', 'scheduledAt', postCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'community_posts', key: 'scheduledAt', required: false,
}))
await columnStep('Column community_posts.publishedAt', 'publishedAt', postCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'community_posts', key: 'publishedAt', required: false,
}))
await columnStep('Column community_posts.pollOptions', 'pollOptions', postCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'community_posts', key: 'pollOptions', size: 1000, required: false,
}))
await columnStep('Column community_posts.pollEndsAt', 'pollEndsAt', postCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'community_posts', key: 'pollEndsAt', required: false,
}))

await step('Table poll_votes', () => tablesDB.createTable({
  databaseId, tableId: 'poll_votes', name: 'Poll Votes', permissions: [], rowSecurity: true,
}))
const voteCols = await existingColumnKeys('poll_votes')
await columnStep('Column poll_votes.postId', 'postId', voteCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'poll_votes', key: 'postId', size: 36, required: true,
}))
await columnStep('Column poll_votes.userId', 'userId', voteCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'poll_votes', key: 'userId', size: 36, required: true,
}))
await columnStep('Column poll_votes.optionIndex', 'optionIndex', voteCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'poll_votes', key: 'optionIndex', required: true, min: 0, max: 5,
}))

await waitForColumns('community_posts')
await waitForColumns('poll_votes')

await step('Index community_posts.idx_feed', () => tablesDB.createIndex({
  databaseId, tableId: 'community_posts', key: 'idx_feed', type: TablesDBIndexType.Key, columns: ['status', 'publishedAt'],
}))
await step('Index community_posts.idx_author', () => tablesDB.createIndex({
  databaseId, tableId: 'community_posts', key: 'idx_author', type: TablesDBIndexType.Key, columns: ['authorId'],
}))
await step('Index community_posts.idx_scheduled', () => tablesDB.createIndex({
  databaseId, tableId: 'community_posts', key: 'idx_scheduled', type: TablesDBIndexType.Key, columns: ['status', 'scheduledAt'],
}))
await step('Index poll_votes.uq_post_user', () => tablesDB.createIndex({
  databaseId, tableId: 'poll_votes', key: 'uq_post_user', type: TablesDBIndexType.Unique, columns: ['postId', 'userId'],
}))
await step('Index poll_votes.idx_post_option', () => tablesDB.createIndex({
  databaseId, tableId: 'poll_votes', key: 'idx_post_option', type: TablesDBIndexType.Key, columns: ['postId', 'optionIndex'],
}))

console.log('✔ Migration posts-001 fertig')
