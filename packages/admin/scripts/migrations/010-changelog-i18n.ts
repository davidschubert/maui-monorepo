/**
 * Migration admin-010: changelog zweisprachig (titleEn + bodyEn).
 *
 * title/body bleiben Deutsch; titleEn/bodyEn tragen die englische Variante.
 * Anzeige je UI-Sprache mit Fallback. Idempotent (409 → skip).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/admin/scripts/migrations/010-changelog-i18n.ts
 *
 * Benötigte Key-Scopes: tables.*, columns.* (Migrations-Key).
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
    if (hasCode(error, 409)) {
      console.log(`↷ ${label} (existiert bereits)`)
      return
    }
    throw error
  }
}

console.log(`Migration admin-010 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Column changelog.titleEn', () => tablesDB.createStringColumn({
  databaseId, tableId: 'changelog', key: 'titleEn', size: 200, required: false,
}))
await step('Column changelog.bodyEn', () => tablesDB.createStringColumn({
  databaseId, tableId: 'changelog', key: 'bodyEn', size: 5000, required: false,
}))

console.log('✔ Migration admin-010 fertig')
