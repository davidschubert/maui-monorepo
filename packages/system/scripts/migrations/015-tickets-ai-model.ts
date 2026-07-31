/**
 * Migration system-015: app_config.ticketsAiModel — Laufzeit-Override fürs
 * KI-Triage-Modell des Ticket-Boards (leer = Default aus pukalani.tickets.ai).
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
/**
 * app_config ist am utf8mb4-Zeilenbudget von MariaDB — Appwrite prüft die
 * Größe VOR der Duplikat-Erkennung und antwortet auf ein erneutes
 * createColumn mit 400 `column_limit_exceeded` statt 409. Ohne Vorab-Check
 * wäre diese Migration nicht mehr idempotent (N2).
 */
async function columnExists(tableId: string, key: string): Promise<boolean> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    return columns.some(column => column.key === key)
  }
  catch {
    return false
  }
}

console.log(`Migration system-015 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

if (await columnExists('app_config', 'ticketsAiModel')) {
  console.log('↷ Column app_config.ticketsAiModel (existiert bereits)')
}
else {
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
}

console.log('✔ Migration system-015 fertig')
