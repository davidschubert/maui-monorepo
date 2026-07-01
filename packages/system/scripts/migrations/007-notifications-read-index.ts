/**
 * Migration system-007: Composite-Index (recipientId, read) auf notifications.
 *
 * „Alle als gelesen markieren" filtert jetzt server-seitig nach read=false
 * (statt eine willkürliche 100er-Seite zu laden) — die Query braucht den Index.
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/system/scripts/migrations/007-notifications-read-index.ts
 *
 * Benötigte Key-Scopes: indexes.* (Migrations-Key). Idempotent (409 → skip).
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
  console.error('Fehlende Env-Vars — Script mit --env-file=apps/<app>/.env aufrufen.')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

console.log(`Migration system-007 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

try {
  await tablesDB.createIndex({
    databaseId,
    tableId: 'notifications',
    key: 'recipient_read',
    type: TablesDBIndexType.Key,
    columns: ['recipientId', 'read'],
  })
  console.log('✔ Index notifications.recipient_read')
}
catch (error) {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
    console.log('↷ Index notifications.recipient_read (existiert bereits)')
  }
  else {
    throw error
  }
}

console.log('Migration system-007 abgeschlossen.')
