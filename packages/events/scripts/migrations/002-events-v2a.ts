/**
 * Migration events-002: Events v2 Teil A (Plan docs/plans/EVENTS-V2.md, E1+E2).
 *
 * AUSSCHLIESSLICH additiv: neue nullable Spalten coverFileId/locationType/
 * replayUrl auf `events` + Bucket `event-covers` (öffentlich lesbar wie
 * `fonts`; geschrieben wird nur server-seitig über die Cover-Route mit
 * Magic-Bytes-Check). Bestandsrows bleiben unverändert gültig
 * (locationType null ⇒ Ableitung aus `url` zur Laufzeit). Idempotent
 * (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer events
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
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
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
async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    return new Set(columns.map(column => column.key))
  }
  catch (error) {
    if (hasCode(error, 404)) return new Set()
    throw error
  }
}
async function columnStep(label: string, key: string, existing: Set<string>, run: () => Promise<unknown>) {
  if (existing.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  await step(label, run)
}

console.log(`Migration events-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const eventCols = await existingColumnKeys('events')
await columnStep('Column events.coverFileId', 'coverFileId', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'coverFileId', size: 36, required: false,
}))
await columnStep('Column events.locationType', 'locationType', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'locationType', size: 8, required: false,
}))
await columnStep('Column events.replayUrl', 'replayUrl', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'events', key: 'replayUrl', size: 500, required: false,
}))

await step(`Bucket 'event-covers'`, () => storage.createBucket({
  bucketId: 'event-covers',
  name: 'event-covers',
  // öffentlich lesbar (Cover sind Teil der öffentlichen Event-Seite);
  // geschrieben wird NUR über die Server-Route (Magic-Bytes-Check)
  permissions: ['read("any")'],
  fileSecurity: false,
  maximumFileSize: 2 * 1024 * 1024,
  allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp'],
}))

console.log('✔ Migration events-002 fertig')
