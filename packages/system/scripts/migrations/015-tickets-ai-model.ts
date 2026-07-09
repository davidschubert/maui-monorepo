/**
 * Migration system-015: app_config.ticketsAiModel — Laufzeit-Override fürs
 * KI-Triage-Modell des Ticket-Boards (leer = Default aus maui.tickets.ai).
 * Der tickets-Layer liest/schreibt die Spalte über eigene Routen
 * (Board-Einstellungen-Modal). Idempotent (409 → skip).
 *
 *   pnpm migrate --app <app> --layer system
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
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

console.log(`Migration system-015 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

try {
  await tablesDB.createVarcharColumn({
    databaseId, tableId: 'app_config', key: 'ticketsAiModel', size: 100, required: false, xdefault: '',
  })
  console.log('✔ Column app_config.ticketsAiModel')
}
catch (error) {
  if (hasCode(error, 409)) console.log('↷ Column app_config.ticketsAiModel (existiert bereits)')
  else throw error
}

console.log('✔ Migration system-015 fertig')
