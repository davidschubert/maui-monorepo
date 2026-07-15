/**
 * Migration system-017: Composite-Index activities.idx_object — Grundlage für
 * removeActivitiesForObject() (core): Moderations-/Lösch-Cascades entfernen
 * die Feed-Einträge eines Objekts per Query.equal(objectType)+equal(objectId);
 * ohne Index lehnt Appwrite die Query ab. Additiv + idempotent (409 → skip).
 *
 *   pnpm migrate --app <app> --layer system
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
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

console.log(`Migration system-017 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

try {
  await tablesDB.createIndex({
    databaseId, tableId: 'activities', key: 'idx_object',
    type: TablesDBIndexType.Key, columns: ['objectType', 'objectId'],
  })
  console.log('✔ Index activities.idx_object')
}
catch (error) {
  if (hasCode(error, 409)) console.log('↷ Index activities.idx_object (existiert bereits)')
  else throw error
}

console.log('✔ Migration system-017 fertig')
