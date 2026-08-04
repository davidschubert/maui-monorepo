/**
 * Migration posts-010: `post_views` — die Aufruf-Zähler der Topics
 * (F1 Stufe 2, Spalte „Aufrufe").
 *
 * REIHENFOLGE: MIGRATION ZUERST, DEPLOY DANACH. Anders als bei posts-009 ist
 * das hier weich — ohne Tabelle liefert `topicViewsFor` eine leere Karte und
 * die Spalte zeigt überall 0, die Discussions laufen weiter. Trotzdem dieselbe
 * Reihenfolge, damit niemand sich daran gewöhnt, sie zu prüfen.
 *
 * EINE ZEILE JE BEITRAG, `rowId = postId`. Das ist der ganze Trick der Tabelle:
 * der Zähler ist ohne Nachschlagen adressierbar, „hochzählen sonst anlegen"
 * braucht kein vorheriges Lesen, und ein Wettlauf zweier Instanzen endet in
 * einem 409 statt in zwei Zeilen. Ein Beitrags-Id ist global eindeutig, hier
 * kann also kein Mandant mit einem anderen kollidieren (dieselbe Begründung wie
 * bei den Row-Id-basierten Schlüsseln in events/courses).
 *
 * rowSecurity = true, Table-Permissions LEER — und die Zeilen bekommen auch
 * KEINE Row-Permissions (server/utils/topicViews.ts legt sie mit
 * `permissions: []` an). Das ist der halbe Grund, warum es diese Tabelle
 * überhaupt gibt: eine Zeile ohne Leser erzeugt kein Realtime-Ereignis. Läge
 * der Zähler auf `community_posts`, bekäme jeder Feed-Abonnent bei jedem
 * SEITENAUFRUF eines beliebigen Gastes ein Ereignis geschickt — und `$updatedAt`
 * des Beitrags wanderte mit, was die Aktivitäts-Rechnung aus posts-009 sofort
 * wieder unwahr machte.
 *
 * KEIN BACKFILL. Aufrufe VOR dieser Migration hat niemand gezählt; sie zu
 * schätzen (aus Stimmen, Kommentaren, Alter) wäre eine erfundene Zahl an einer
 * Stelle, an der eine echte steht. Bestand startet bei 0 und wächst ab jetzt.
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

const TABLE = 'post_views'

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

console.log(`Migration posts-010 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${TABLE}`, () => tablesDB.createTable({
  databaseId, tableId: TABLE, name: 'Post Views',
  permissions: [], rowSecurity: true,
}))

const cols = await existingColumnKeys(TABLE)

await columnStep(`Column ${TABLE}.communityId`, 'communityId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'communityId', size: 36, required: false, xdefault: '',
}))
// Redundant zur rowId, aber die Spalte ist das, was sich zusammen mit
// communityId indizieren und in einer Abfrage filtern lässt.
await columnStep(`Column ${TABLE}.postId`, 'postId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'postId', size: 36, required: false, xdefault: '',
}))
// Obergrenze: `incrementRowColumn` hat kein `max` gesetzt bekommen, aber die
// Spalte selbst deckelt. 2^31-1 ist die Grenze eines Integers in MariaDB und
// für einen Aufruf-Zähler in jeder Größenordnung unerreichbar.
await columnStep(`Column ${TABLE}.count`, 'count', cols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: TABLE, key: 'count', required: false, min: 0, max: 2_147_483_647, xdefault: 0,
}))

await waitForColumns(TABLE)

// Die eine Abfrage dieser Tabelle: „Zähler dieser Beiträge, in dieser
// Community" (die Datentür hängt den communityId-Filter selbst an).
await indexStep(`Index ${TABLE}.idx_community_post`, {
  tableId: TABLE, key: 'idx_community_post', type: TablesDBIndexType.Key, columns: ['communityId', 'postId'],
})

console.log('✔ Migration posts-010 fertig')
