/**
 * Migration 009: Key-Index `user` auf `comment_votes.userId`.
 *
 * Die GDPR-Löschung/-Export (userDataContributor) und der myVotes-Read der
 * Listen-Route filtern nach userId ALLEIN — der bestehende Unique-Index
 * (commentId, userId) hilft dabei nicht (userId ist zweite Spalte).
 *
 * IDEMPOTENT (409 → skip).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/comments/scripts/migrations/009-votes-user-index.ts
 *
 * Benötigte Key-Scopes: indexes.* (Migrations-Key, siehe A2).
 */
import { Client, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

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

console.log(`Migration 009 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

try {
  await tablesDB.createIndex({
    databaseId,
    tableId: 'comment_votes',
    key: 'user',
    type: 'key',
    columns: ['userId'],
  })
  console.log('✔ Index comment_votes.user (userId)')
}
catch (error) {
  if (hasCode(error, 409)) console.log('↷ Index comment_votes.user existiert bereits')
  else if (hasCode(error, 404)) console.log('↷ comment_votes existiert nicht — nichts zu tun')
  else throw error
}

console.log('Migration 009 abgeschlossen.')
