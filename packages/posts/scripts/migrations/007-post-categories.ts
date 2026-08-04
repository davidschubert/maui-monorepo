/**
 * Migration posts-007: `post_categories` — die Kategorien-Struktur der
 * Discussions (F1 Stufe 1, Weg B: Kategorie ist eine Dimension von `posts`,
 * kein zweites Forum daneben).
 *
 * REIHENFOLGE: MIGRATION ZUERST, DEPLOY DANACH. Die Kategorien-Routen fragen
 * die Tabelle beim ersten Aufruf; läuft der Code vor der Migration, antwortet
 * die Verwaltungsseite 404/500 statt leer. Umgekehrt ist die Tabelle ohne Code
 * schlicht unbenutzt — additiv, niemand merkt sie.
 *
 * POOL-REGEL: der Unique-Index trägt `communityId` MIT (uq_community_slug).
 * Ohne sie könnte im Pool nur EINE Community eine Kategorie „allgemein"
 * haben — genau der Fehler, den pages-004 und courses-002 nachträglich heilen
 * mussten. Hier steht er von Anfang an richtig.
 *
 * rowSecurity = true, Table-Permissions LEER: Kategorien legt niemand vom
 * Client aus an (`create` gibt es nur über die Route mit `posts.manage`), und
 * WER sie lesen darf, entscheidet die Row-Permission, die die Datentür setzt
 * (`read: 'public'` ⇒ offene Community `any`, geschlossene `label:<id>` — C18).
 *
 * Idempotent (409 → skip). Index-Anlage NUR über die Fabrik (F19).
 *
 *   pnpm migrate --app <app> --layer posts
 */
import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { createIndexSteps } from '../../../../scripts/migrations-lib/indexRetry.mts'

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
const { indexStep } = createIndexSteps(tablesDB, databaseId)

const TABLE = 'post_categories'

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
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration posts-007 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${TABLE}`, () => tablesDB.createTable({
  databaseId, tableId: TABLE, name: 'Post Categories',
  permissions: [], rowSecurity: true,
}))

const cols = await existingColumnKeys(TABLE)

// Mandanten-Spalte von Anfang an `communityId` (E8-3) — kein tenantId-Zwilling
// mehr, der später wieder fallen müsste.
await columnStep(`Column ${TABLE}.communityId`, 'communityId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'communityId', size: 36, required: false, xdefault: '',
}))
await columnStep(`Column ${TABLE}.name`, 'name', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'name', size: 80, required: true,
}))
await columnStep(`Column ${TABLE}.slug`, 'slug', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'slug', size: 64, required: true,
}))
await columnStep(`Column ${TABLE}.description`, 'description', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'description', size: 500, required: false, xdefault: '',
}))
await columnStep(`Column ${TABLE}.sortOrder`, 'sortOrder', cols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: TABLE, key: 'sortOrder', required: false, min: 0, max: 9999, xdefault: 0,
}))
await columnStep(`Column ${TABLE}.active`, 'active', cols, () => tablesDB.createBooleanColumn({
  databaseId, tableId: TABLE, key: 'active', required: false, xdefault: true,
}))

await waitForColumns(TABLE)

// POOL-REGEL: der Slug ist nur ZUSAMMEN mit der Community eindeutig.
await indexStep(`Index ${TABLE}.uq_community_slug`, {
  tableId: TABLE, key: 'uq_community_slug', type: TablesDBIndexType.Unique, columns: ['communityId', 'slug'],
})
// Anzeige-Reihenfolge der Kategorien einer Community.
await indexStep(`Index ${TABLE}.idx_community_sort`, {
  tableId: TABLE, key: 'idx_community_sort', type: TablesDBIndexType.Key, columns: ['communityId', 'sortOrder'],
})

console.log('✔ Migration posts-007 fertig')
