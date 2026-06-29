/**
 * Migration 006: `targetUrl` an Kommentaren.
 *
 * Die Seiten-URL, auf der der Kommentar lebt — vom Client beim Erstellen
 * mitgegeben. Damit kann die Reply-Benachrichtigung auf die echte Stelle
 * verlinken (statt hart auf '/'). Bestandskommentare bleiben null → Fallback '/'.
 *
 * Additiv + idempotent (409 → skip), nur Schema (Migrations-Key).
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/comments/scripts/migrations/006-target-url.ts
 */
import { Client, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
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
    if (hasCode(error, 409)) { console.log(`↷ ${label} (existiert bereits)`); return }
    throw error
  }
}

console.log(`Migration 006 (targetUrl) gegen ${endpoint} / DB ${databaseId}`)

await step('Column comments.targetUrl', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'targetUrl', size: 2000, required: false,
}))

console.log('Migration 006 abgeschlossen.')
