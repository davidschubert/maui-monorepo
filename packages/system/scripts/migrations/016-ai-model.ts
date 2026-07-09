/**
 * Migration system-016: app_config.aiModel — globales Laufzeit-Override fürs
 * Core-KI-Modell (aiComplete, Gate maui.ai). Leer = Build-Default aus
 * maui.ai.model. Gelesen von core getEffectiveAiConfig(); geschrieben über
 * die Admin-Config-Seite (system.manage). Layer-spezifische Overrides
 * (app_config.ticketsAiModel, system-015) schlagen das globale.
 * Idempotent (409 → skip).
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

console.log(`Migration system-016 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

try {
  await tablesDB.createVarcharColumn({
    databaseId, tableId: 'app_config', key: 'aiModel', size: 100, required: false, xdefault: '',
  })
  console.log('✔ Column app_config.aiModel')
}
catch (error) {
  if (hasCode(error, 409)) console.log('↷ Column app_config.aiModel (existiert bereits)')
  else throw error
}

console.log('✔ Migration system-016 fertig')
