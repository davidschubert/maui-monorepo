/**
 * Migration system-012: Table `custom_fonts` + Storage-Bucket `fonts`
 * (Theme-Studio: individuelle Schriftarten).
 *
 * Im Admin hochgeladene Schriften (nur WOFF2): Name + Datei-Zuordnung je
 * Gewicht (JSON) + Reihenfolge. Die @font-face-Regeln werden zur Laufzeit
 * gerendert (themes/shared/fonts.ts) — hier liegt nur die Quelle.
 * KEINE Table-Permissions: gelesen wird über die öffentliche Server-Route
 * (Admin-Client), geschrieben über Admin-Routen mit
 * requirePermission('system.manage'). Bucket-Dateien sind öffentlich lesbar
 * (Fonts werden vom Browser geladen), geschrieben wird nur per Server-Key.
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/system/scripts/migrations/012-custom-fonts.ts
 *
 * Benötigte Key-Scopes: tables.*, columns.* + buckets.* (Migrations-Key).
 * Idempotent.
 */
import { Client, Storage, TablesDB } from 'node-appwrite'

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

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)
const storage = new Storage(client)

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

console.log(`Migration system-012 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table custom_fonts', () => tablesDB.createTable({
  databaseId,
  tableId: 'custom_fonts',
  name: 'Custom Fonts',
  permissions: [], // nur Server-Key (öffentliche Liste läuft über die Nuxt-Route)
  rowSecurity: false,
}))

await step('Column custom_fonts.name', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'custom_fonts', key: 'name', size: 64, required: true,
}))
// files: JSON-Array [{ weight, fileId, variable? }] — validiert in den Admin-Routen
await step('Column custom_fonts.files', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'custom_fonts', key: 'files', size: 2048, required: true,
}))
await step('Column custom_fonts.order', () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'custom_fonts', key: 'order', required: false, xdefault: 0,
}))

// Bucket: öffentlich lesbar (Font-Dateien lädt der Browser direkt),
// geschrieben wird ausschließlich über die Admin-Route (Server-Key).
await step(`Bucket 'fonts'`, () => storage.createBucket({
  bucketId: 'fonts',
  name: 'fonts',
  permissions: ['read("any")'],
  fileSecurity: false,
  maximumFileSize: 3 * 1024 * 1024,
  allowedFileExtensions: ['woff2'],
}))

console.log('Migration system-012 abgeschlossen.')
