/**
 * Migration system-006: audit_logs für Admins lesbar machen (read: label:admin).
 *
 * Das Aktivitätsprotokoll soll live aktualisieren — dafür abonniert der
 * Admin-Client die audit_logs-Rows per Realtime, was Lese-Recht voraussetzt.
 * Beschränkt auf Nutzer mit dem Label 'admin' (Role.label) — nicht öffentlich.
 * Schreiben bleibt server-only (kein write-Recht), über recordAudit().
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/system/scripts/migrations/006-audit-read.ts
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

console.log(`Migration system-006 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await tablesDB.updateTable({
  databaseId,
  tableId: 'audit_logs',
  name: 'Audit Logs',
  // read nur für Label 'admin' → Live-Subscription möglich; kein write
  permissions: [Permission.read(Role.label('admin'))],
  rowSecurity: false,
})

console.log('✔ Migration system-006 fertig (audit_logs read: label:admin)')
