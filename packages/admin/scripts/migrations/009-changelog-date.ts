/**
 * Migration admin-009: changelog.date (Release-Datum).
 *
 * Eigenes Datum pro Eintrag — unabhängig davon, wann die Row angelegt/bearbeitet
 * wurde. Erlaubt historische Backfills mit echtem Datum und Sortierung danach.
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/admin/scripts/migrations/009-changelog-date.ts
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
async function step(label: string, run: () => Promise<unknown>) {
  try { await run(); console.log(`✔ ${label}`) }
  catch (error) { if (hasCode(error, 409)) { console.log(`↷ ${label} (existiert bereits)`); return } throw error }
}

console.log(`Migration admin-009 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Column changelog.date', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'changelog', key: 'date', required: false,
}))

for (let i = 0; i < 30; i++) {
  const { columns } = await tablesDB.listColumns({ databaseId, tableId: 'changelog' })
  if (columns.find(c => c.key === 'date')?.status === 'available') break
  await new Promise(r => setTimeout(r, 1000))
}

await step('Index changelog.date', () => tablesDB.createIndex({
  databaseId, tableId: 'changelog', key: 'date', type: 'key', columns: ['date'],
}))

console.log('✔ Migration admin-009 fertig')
