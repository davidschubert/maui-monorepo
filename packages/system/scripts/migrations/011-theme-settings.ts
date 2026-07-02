/**
 * Migration system-011: Theme-Studio-Ausbau.
 *
 * - `app_config.themeSettings` (JSON): Instanz-weite Theme-Einstellungen —
 *   Default-Theme für Besucher ohne Cookie, Built-ins umbenennen/ausblenden/
 *   umsortieren.
 * - `custom_themes.variants` (JSON): Farbvarianten eigener Themes
 *   (wie Ocean/Teal — data-variant überschreibt die Primary-Ramp).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/system/scripts/migrations/011-theme-settings.ts
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

async function step(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 409)) console.log(`↷ ${label} (existiert bereits)`)
    else if (hasCode(error, 404)) console.log(`↷ ${label} (Table fehlt — übersprungen)`)
    else throw error
  }
}

console.log(`Migration system-011 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Column app_config.themeSettings', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'app_config', key: 'themeSettings', size: 4096, required: false,
}))
await step('Column custom_themes.variants', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'custom_themes', key: 'variants', size: 1024, required: false,
}))

console.log('Migration system-011 abgeschlossen.')
