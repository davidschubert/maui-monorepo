/**
 * Migration system-013: Table-read(any) für custom_themes + custom_fonts.
 *
 * Live-Propagation von Theme-/Schrift-Änderungen: Offene Clients (auch Gäste)
 * abonnieren die Tables per Realtime und refetchen /api/themes//api/fonts —
 * Farben/Schriften morphen ohne Reload. Ohne Lese-Permission liefert Appwrite
 * keine Realtime-Events; die Inhalte (Namen, Farben, Datei-IDs) sind ohnehin
 * öffentlich (NO_AUTH-Routen). Schreiben bleibt Server-Key-only (keine
 * create/update/delete-Permissions).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/system/scripts/migrations/013-theme-realtime-read.ts
 *
 * Benötigte Key-Scopes: tables.* (Migrations-Key). Idempotent (Update).
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

console.log(`Migration system-013 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

for (const [tableId, name] of [['custom_themes', 'Custom Themes'], ['custom_fonts', 'Custom Fonts']] as const) {
  await tablesDB.updateTable({
    databaseId,
    tableId,
    name,
    permissions: ['read("any")'],
    rowSecurity: false,
  })
  console.log(`✔ ${tableId}: Table-Permissions = [read(any)] (Realtime-Events für alle Clients)`)
}

console.log('Migration system-013 abgeschlossen.')
