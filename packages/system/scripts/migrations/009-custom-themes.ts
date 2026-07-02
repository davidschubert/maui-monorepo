/**
 * Migration system-009: Table `custom_themes` (Theme-Studio).
 *
 * Im Admin angelegte eigene Themes (Name + Basisfarbe + Reihenfolge). Die
 * Ramp wird zur Laufzeit generiert (themes/shared/ramp.ts) — hier liegt nur
 * die Quelle. KEINE Table-Permissions: gelesen wird über die öffentliche
 * Server-Route (Admin-Client), geschrieben über Admin-Routen mit
 * requirePermission('system.manage').
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/system/scripts/migrations/009-custom-themes.ts
 *
 * Benötigte Key-Scopes: tables.*, columns.* (Migrations-Key). Idempotent.
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

console.log(`Migration system-009 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table custom_themes', () => tablesDB.createTable({
  databaseId,
  tableId: 'custom_themes',
  name: 'Custom Themes',
  permissions: [], // nur Server-Key (öffentliche Liste läuft über die Nuxt-Route)
  rowSecurity: false,
}))

await step('Column custom_themes.name', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'custom_themes', key: 'name', size: 64, required: true,
}))
await step('Column custom_themes.primary', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'custom_themes', key: 'primary', size: 16, required: true,
}))
await step('Column custom_themes.order', () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'custom_themes', key: 'order', required: false, xdefault: 0,
}))

console.log('Migration system-009 abgeschlossen.')
