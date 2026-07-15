/**
 * Migration media-001: Table `media_items` + Bucket `media` — verwaltete
 * Bild-Galerie (Titel/Untertitel/Alt, featured, published, sortOrder).
 * Bucket ist read(any) (öffentliche Galerie-Bilder); GESCHRIEBEN wird nur
 * server-seitig über die media.manage-Routen (Admin-Client). Rows tragen
 * bewusst KEINE User-Referenz (Attribution übers Audit-Log). Additiv +
 * idempotent (409 → skip).
 *
 *   pnpm migrate --app <app> --layer media
 */
import { Client, TablesDB, Storage, Permission, Role, TablesDBIndexType } from 'node-appwrite'

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

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration media-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table media_items', () => tablesDB.createTable({
  databaseId, tableId: 'media_items', name: 'Media Items',
  // Published-Sichtbarkeit steuert die GET-Route (published-Filter);
  // Table-read(any) hält die öffentliche Liste ohne Row-Permission-Pflege.
  permissions: [Permission.read(Role.any())],
  rowSecurity: false,
}))

await step('Column media_items.title', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'media_items', key: 'title', size: 200, required: true,
}))
await step('Column media_items.subtitle', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'media_items', key: 'subtitle', size: 200, required: false, xdefault: '',
}))
await step('Column media_items.alt', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'media_items', key: 'alt', size: 300, required: false, xdefault: '',
}))
await step('Column media_items.fileId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'media_items', key: 'fileId', size: 36, required: true,
}))
await step('Column media_items.featured', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'media_items', key: 'featured', required: false, xdefault: false,
}))
await step('Column media_items.published', () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'media_items', key: 'published', required: false, xdefault: true,
}))
await step('Column media_items.sortOrder', () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'media_items', key: 'sortOrder', required: false, xdefault: 0,
}))

await waitForColumns('media_items')

await step('Index media_items.idx_published_order', () => tablesDB.createIndex({
  databaseId, tableId: 'media_items', key: 'idx_published_order',
  type: TablesDBIndexType.Key, columns: ['published', 'sortOrder'],
}))

await step('Bucket media', () => storage.createBucket({
  bucketId: 'media', name: 'media',
  permissions: [Permission.read(Role.any())],
  fileSecurity: false, enabled: true,
  maximumFileSize: 15 * 1024 * 1024,
  allowedFileExtensions: ['png', 'jpg', 'jpeg', 'webp'],
  compression: 'none', encryption: false, antivirus: false,
}))

console.log('✔ Migration media-001 fertig')
