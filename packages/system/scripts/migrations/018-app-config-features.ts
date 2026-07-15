/**
 * Migration system-018: app_config.features — Laufzeit-Feature-Gates (F2).
 * JSON-String { "<featureKey>": { "enabled": bool, "status": "active|…" } };
 * leer/fehlend = alle einkompilierten Features an. Gelesen von core
 * getAppConfig()/featureGates; geschrieben über die Admin-Features-Seite
 * (system.manage). Idempotent (409 → skip).
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

console.log(`Migration system-018 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

try {
  await tablesDB.createVarcharColumn({
    databaseId, tableId: 'app_config', key: 'features', size: 4000, required: false, xdefault: '',
  })
  console.log('✔ Column app_config.features')
}
catch (error) {
  if (hasCode(error, 409)) console.log('↷ Column app_config.features (existiert bereits)')
  else throw error
}

console.log('✔ Migration system-018 fertig')
