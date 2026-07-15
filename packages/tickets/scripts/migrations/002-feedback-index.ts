/**
 * Migration tickets-002: Index auf tickets.feedbackId (P2 Feedback-Ingestion —
 * die Doppel-Übernahme-Prüfung fragt per Query.equal darauf). Idempotent.
 * Trotz des Namens KEIN Zugriff auf den feedback-Layer: indiziert wird die
 * EIGENE Spalte tickets.feedbackId (aus tickets-001) — läuft also auch auf
 * Instanzen ohne installierten feedback-Layer (M3-Audit geklärt).
 *
 *   pnpm migrate --app <app> --layer tickets
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

console.log(`Migration tickets-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

try {
  await tablesDB.createIndex({
    databaseId, tableId: 'tickets', key: 'idx_feedback', type: TablesDBIndexType.Key, columns: ['feedbackId'],
  })
  console.log('✔ Index tickets.idx_feedback')
}
catch (error) {
  if (hasCode(error, 409)) console.log('↷ Index tickets.idx_feedback (existiert bereits)')
  else throw error
}

console.log('✔ Migration tickets-002 fertig')
