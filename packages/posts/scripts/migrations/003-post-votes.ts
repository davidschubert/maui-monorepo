/**
 * Migration posts-003: Up-/Downvotes für Community-Posts (Muster comments).
 *
 * post_votes: User schreiben ihre Vote-Rows selbst (create(users) +
 * rowSecurity, Unique-Index sichert 1 Vote/User/Post); die denormalisierten
 * Zähler upvotes/downvotes/score auf community_posts schreibt NUR der Server
 * (Recount + ein Write → ein Realtime-Event). Idempotent.
 *
 *   pnpm migrate --app <app> --layer posts
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

console.log(`Migration posts-003 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table post_votes', () => tablesDB.createTable({
  databaseId, tableId: 'post_votes', name: 'Post Votes',
  permissions: [Permission.create(Role.users())], rowSecurity: true,
}))
const voteCols = await existingColumnKeys('post_votes')
await columnStep('Column post_votes.postId', 'postId', voteCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'post_votes', key: 'postId', size: 36, required: true,
}))
await columnStep('Column post_votes.userId', 'userId', voteCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'post_votes', key: 'userId', size: 36, required: true,
}))
await columnStep('Column post_votes.value', 'value', voteCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'post_votes', key: 'value', required: true, min: -1, max: 1,
}))

const postCols = await existingColumnKeys('community_posts')
await columnStep('Column community_posts.upvotes', 'upvotes', postCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'community_posts', key: 'upvotes', required: false, xdefault: 0,
}))
await columnStep('Column community_posts.downvotes', 'downvotes', postCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'community_posts', key: 'downvotes', required: false, xdefault: 0,
}))
await columnStep('Column community_posts.score', 'score', postCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'community_posts', key: 'score', required: false, xdefault: 0,
}))

await waitForColumns('post_votes')
await waitForColumns('community_posts')

await step('Index post_votes.uq_post_user', () => tablesDB.createIndex({
  databaseId, tableId: 'post_votes', key: 'uq_post_user', type: TablesDBIndexType.Unique, columns: ['postId', 'userId'],
}))
await step('Index post_votes.idx_post_value', () => tablesDB.createIndex({
  databaseId, tableId: 'post_votes', key: 'idx_post_value', type: TablesDBIndexType.Key, columns: ['postId', 'value'],
}))

console.log('✔ Migration posts-003 fertig')
