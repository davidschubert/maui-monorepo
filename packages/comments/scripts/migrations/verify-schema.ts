/**
 * Read-only Schema-Verifikation: prüft mit dem Migrations-Key, ob das
 * 002-Schema vollständig vorhanden ist (Tables, Columns, Indizes) —
 * idempotenter "Probelauf" ohne jede Schreiboperation.
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/comments/scripts/migrations/verify-schema.ts
 *
 * Benötigte Key-Scopes: tables.read, columns.read, indexes.read.
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

const EXPECTED = {
  comments: {
    columns: ['targetId', 'targetType', 'content', 'authorId', 'authorName', 'parentId', 'upvotes', 'downvotes', 'score', 'status'],
    indexes: ['target', 'parent', 'score', 'status'],
  },
  comment_votes: {
    columns: ['commentId', 'userId', 'value'],
    indexes: ['commentId_userId'],
  },
} as const

let failed = false

for (const [tableId, expected] of Object.entries(EXPECTED)) {
  const { columns } = await tablesDB.listColumns({ databaseId, tableId })
  const { indexes } = await tablesDB.listIndexes({ databaseId, tableId })

  const columnKeys = new Set(columns.map(column => column.key))
  const indexKeys = new Set(indexes.map(index => index.key))
  const notAvailable = columns.filter(column => column.status !== 'available').map(column => column.key)

  const missingColumns = expected.columns.filter(key => !columnKeys.has(key))
  const missingIndexes = expected.indexes.filter(key => !indexKeys.has(key))

  if (missingColumns.length || missingIndexes.length || notAvailable.length) {
    failed = true
    console.error(`✘ ${tableId}: fehlende Columns [${missingColumns.join(', ')}], fehlende Indizes [${missingIndexes.join(', ')}], nicht verfügbar [${notAvailable.join(', ')}]`)
  }
  else {
    console.log(`✔ ${tableId}: ${expected.columns.length} Columns, ${expected.indexes.length} Indizes — vollständig & verfügbar`)
  }
}

if (failed) {
  console.error('Schema-Verifikation FEHLGESCHLAGEN — Migration 002 ausführen.')
  process.exit(1)
}

console.log('Schema-Verifikation erfolgreich (002-Stand).')
