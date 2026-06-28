/**
 * Migration system-004: Spalte audit_logs.ip.
 *
 * Hält die IP des Akteurs im Aktivitätsprotokoll fest. Idempotent (409 → skip).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/system/scripts/migrations/004-audit-ip.ts
 */
import { Client, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — Script mit --env-file=apps/<app>/.env aufrufen.')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

try {
  await tablesDB.createVarcharColumn({ databaseId, tableId: 'audit_logs', key: 'ip', size: 64, required: false })
  console.log('✔ Column audit_logs.ip')
}
catch (error) {
  if (hasCode(error, 409)) console.log('↷ Column audit_logs.ip existiert bereits')
  else { console.error('✖', error); process.exit(1) }
}
