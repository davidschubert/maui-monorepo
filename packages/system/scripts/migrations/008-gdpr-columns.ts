/**
 * Migration system-008: GDPR-Spalten/-Indizes.
 *
 * - `notifications.senderId` (optional) + Index `sender`: der Verursacher
 *   einer Notification (Klarname steckt in title/body) war bisher nicht
 *   abfragbar — die GDPR-Löschung braucht den Schlüssel, um Notifications
 *   zu löschen, die der Gelöschte VERURSACHT hat. Bestandsdaten ohne
 *   senderId: akzeptierte, dokumentierte Lücke (Plan §4.6/E8).
 * - `audit_logs`-Index `target` auf targetId: die Pseudonymisierung leert
 *   targetName für alle Logs, die auf den gelöschten User zeigen.
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/system/scripts/migrations/008-gdpr-columns.ts
 *
 * Benötigte Key-Scopes: columns.*, indexes.* (Migrations-Key). Idempotent
 * (409 → skip); Column wird vor der Index-Anlage auf 'available' gepollt.
 */
import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite'

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

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration system-008 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Column notifications.senderId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'notifications', key: 'senderId', size: 255, required: false,
}))
await waitForColumns('notifications')
await step('Index notifications.sender', () => tablesDB.createIndex({
  databaseId, tableId: 'notifications', key: 'sender', type: TablesDBIndexType.Key, columns: ['senderId'],
}))

await step('Index audit_logs.target', () => tablesDB.createIndex({
  databaseId, tableId: 'audit_logs', key: 'target', type: TablesDBIndexType.Key, columns: ['targetId'],
}))

console.log('Migration system-008 abgeschlossen.')
