/**
 * Migration 003: Index auf comments.authorId.
 *
 * Ermöglicht Query.equal('authorId', …) — z.B. für die Admin-User-Detailseite
 * ("Kommentare dieses Users"). Idempotent (409 → skip).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/comments/scripts/migrations/003-author-index.ts
 *
 * Benötigte Key-Scopes: indexes.* (Migrations-Key, siehe A2).
 */
import { Client, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}

if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — Script mit --env-file=apps/<app>/.env aufrufen.')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

try {
  await tablesDB.createIndex({
    databaseId,
    tableId: 'comments',
    key: 'author',
    type: 'key',
    columns: ['authorId'],
  })
  console.log('✔ Index comments.author (authorId)')
}
catch (error) {
  if (hasCode(error, 409)) {
    console.log('↷ Index comments.author existiert bereits')
  }
  else {
    console.error('✖ Index-Anlage fehlgeschlagen:', error)
    process.exit(1)
  }
}
