/**
 * Migration system-010: `custom_themes.config` — Generator-Parameter des
 * Theme-Studios als JSON (mode/anchor/hueShift/saturation/lightnessMax/
 * lightnessMin/radius). Optional: fehlende Config = Perceived-Defaults.
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/system/scripts/migrations/010-theme-config.ts
 *
 * Benötigte Key-Scopes: columns.* (Migrations-Key). Idempotent (409 → skip).
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

console.log(`Migration system-010 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

try {
  await tablesDB.createVarcharColumn({
    databaseId, tableId: 'custom_themes', key: 'config', size: 2048, required: false,
  })
  console.log('✔ Column custom_themes.config')
}
catch (error) {
  if (hasCode(error, 409)) console.log('↷ Column custom_themes.config existiert bereits')
  else if (hasCode(error, 404)) console.log('↷ custom_themes existiert nicht — nichts zu tun')
  else throw error
}

console.log('Migration system-010 abgeschlossen.')
