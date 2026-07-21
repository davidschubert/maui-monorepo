/**
 * Migration pages-001: Table pages (editierbare Inhaltsseiten).
 *
 * Eine Row pro Seite×Sprache (slug + locale). Geschrieben/gelesen NUR
 * server-seitig: Admin-CRUD (pages.manage) + öffentliche SSR-Route (Admin-
 * Client, nur status='published'). Rows tragen deshalb KEINE Permissions.
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer pages
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
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
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

console.log(`Migration pages-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table pages', () => tablesDB.createTable({
  databaseId, tableId: 'pages', name: 'Pages', permissions: [], rowSecurity: true,
}))
const cols = await existingColumnKeys('pages')
await columnStep('Column pages.slug', 'slug', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'pages', key: 'slug', size: 64, required: true,
}))
await columnStep('Column pages.locale', 'locale', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'pages', key: 'locale', size: 8, required: true,
}))
await columnStep('Column pages.title', 'title', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'pages', key: 'title', size: 256, required: true,
}))
// body = Markdown. Grenze ist NICHT die Einzelspalte (16.381), sondern das
// utf8mb4-ZEILENbudget: MariaDB max ~65.535 Bytes/Zeile ÷ 4 Bytes/Zeichen,
// minus title/slug/locale/status + Appwrite-Interna. body(16000) sprengt das
// (64.002 B allein) → 14.000 als sichere Obergrenze mit Marge. Sehr lange
// Rechtstexte ggf. auf mehrere Seiten aufteilen (oder später storage-backed).
await columnStep('Column pages.body', 'body', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'pages', key: 'body', size: 14000, required: false, xdefault: '',
}))
await columnStep('Column pages.status', 'status', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'pages', key: 'status', size: 12, required: true,
}))
await columnStep('Column pages.sortOrder', 'sortOrder', cols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'pages', key: 'sortOrder', required: false, xdefault: 0, min: 0, max: 9999,
}))

await waitForColumns('pages')

// eine Sprachversion je slug: (slug, locale) eindeutig
await step('Index pages.uq_slug_locale', () => tablesDB.createIndex({
  databaseId, tableId: 'pages', key: 'uq_slug_locale', type: TablesDBIndexType.Unique, columns: ['slug', 'locale'],
}))
// Gruppierung im Admin + öffentliches Lookup per slug
await step('Index pages.idx_slug', () => tablesDB.createIndex({
  databaseId, tableId: 'pages', key: 'idx_slug', type: TablesDBIndexType.Key, columns: ['slug'],
}))
// öffentliche Route filtert nach status='published'
await step('Index pages.idx_status', () => tablesDB.createIndex({
  databaseId, tableId: 'pages', key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'],
}))

console.log('✔ Migration pages-001 fertig')
