/**
 * Migration system-005: app_config öffentlich lesbar machen (read: any).
 *
 * Für die Live-Propagierung der Feature-Flags abonniert der Client die
 * app_config/global-Row per Realtime — das setzt Lese-Recht voraus. Die Flags
 * sind ohnehin öffentlich (GET /api/config), daher read: any. Schreiben bleibt
 * server-only (kein write-Recht), durchgesetzt über /api/admin/config.
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/system/scripts/migrations/005-app-config-read.ts
 *
 * Benötigte Key-Scopes: tables.* (Migrations-Key).
 */
import { Client, TablesDB, Permission, Role } from 'node-appwrite'

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

console.log(`Migration system-005 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await tablesDB.updateTable({
  databaseId,
  tableId: 'app_config',
  name: 'App Config',
  // read: any → Client darf die Flags lesen & per Realtime abonnieren; kein write
  permissions: [Permission.read(Role.any())],
  rowSecurity: false,
})

console.log('✔ Migration system-005 fertig (app_config read: any)')
