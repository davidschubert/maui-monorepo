/**
 * Migration feedback-002: Fulltext-Index auf feedback.message.
 *
 * Ermöglicht Query.search('message', …) — die Suche in der Feedback-Liste
 * (/dashboard/feedback). Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer feedback
 *
 * Benötigte Key-Scopes: indexes.* (Migrations-Key).
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

console.log(`Migration feedback-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

try {
  await tablesDB.createIndex({
    databaseId,
    tableId: 'feedback',
    key: 'idx_message_search',
    type: TablesDBIndexType.Fulltext,
    columns: ['message'],
  })
  console.log('✔ Fulltext-Index feedback.idx_message_search')
}
catch (error) {
  if (hasCode(error, 409)) {
    console.log('↷ Index feedback.idx_message_search existiert bereits')
  }
  else {
    console.error('✖ Index-Anlage fehlgeschlagen:', error)
    process.exit(1)
  }
}

console.log('✔ Migration feedback-002 fertig')
