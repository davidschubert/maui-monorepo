/**
 * Migration 004: Fulltext-Index auf comments.content.
 *
 * Ermöglicht Query.search('content', …) — für die globale Dashboard-Suche.
 * Idempotent (409 → skip).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/comments/scripts/migrations/004-content-fulltext.ts
 *
 * Benötigte Key-Scopes: indexes.* (Migrations-Key).
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
    key: 'content_search',
    type: 'fulltext',
    columns: ['content'],
  })
  console.log('✔ Fulltext-Index comments.content_search')
}
catch (error) {
  if (hasCode(error, 409)) {
    console.log('↷ Index comments.content_search existiert bereits')
  }
  else {
    console.error('✖ Index-Anlage fehlgeschlagen:', error)
    process.exit(1)
  }
}
