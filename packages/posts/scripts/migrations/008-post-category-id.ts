/**
 * Migration posts-008: `community_posts.categoryId` — die Kategorie AM Beitrag
 * (F1 Stufe 1, Weg B). ADDITIV und optional: ein Beitrag ohne Kategorie ist
 * und bleibt der Normalfall (Davids Entscheidung 2 — kategorisierte Beiträge
 * bleiben im Feed, Discussions ist die strukturierte Sicht darauf).
 *
 * REIHENFOLGE: MIGRATION ZUERST, DEPLOY DANACH — und hier ist das kein
 * Ratschlag. `CommunityPost.categoryId` ist im Typ PFLICHT, also stempelt
 * `POST /api/posts` die Spalte ab dem Deploy bei JEDEM neuen Beitrag mit. Läuft
 * der Code vor der Migration, schlägt das Anlegen eines Beitrags fehl —
 * dieselbe Falle wie bei einer neuen `communities`-Spalte (CLAUDE.md).
 * Umgekehrt ist die Spalte ohne Code leer und stört niemanden.
 *
 * Bestandszeilen bekommen den Default `''` („keine Kategorie") — deshalb
 * braucht diese Migration KEINEN Backfill und keine Gegenprobe.
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

const TABLE = 'community_posts'

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
async function waitForColumn(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    const column = (columns as unknown as { key: string, status: string }[]).find(c => c.key === key)
    if (column?.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Column ${tableId}.${key} wurde nicht 'available'`)
}

console.log(`Migration posts-008 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// Größe 36 = Appwrite-Row-Id, wie jede andere Fremdschlüssel-Spalte dieses Layers.
await step(`Column ${TABLE}.categoryId`, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'categoryId', size: 36, required: false, xdefault: '',
}))
await waitForColumn(TABLE, 'categoryId')

// Topics EINER Kategorie, neueste zuerst (Kategorie-Ansicht + „Latest").
await indexStep(`Index ${TABLE}.idx_community_category`, {
  tableId: TABLE, key: 'idx_community_category', type: TablesDBIndexType.Key,
  columns: ['communityId', 'categoryId', 'publishedAt'],
})
// „Top": Stimmen absteigend innerhalb der Community. Das Zeitfenster ist ein
// Bereichsfilter auf publishedAt und kann denselben Index nicht mehr nutzen —
// bewusst hingenommen, weil ein dritter Index für eine Handvoll Zeilen je
// Community teurer wäre als der Scan.
await indexStep(`Index ${TABLE}.idx_community_score`, {
  tableId: TABLE, key: 'idx_community_score', type: TablesDBIndexType.Key,
  columns: ['communityId', 'status', 'score'],
})
// Einfache Suche über Topic-TITEL: `Query.search` braucht einen Fulltext-Index
// (dasselbe Muster wie events-003 für `events.title`). Bekannte Grenze von
// MariaDB-Fulltext: sehr kurze Wörter fallen unter die Mindestlänge und finden
// nichts — das teilt sich diese Suche mit der Termin-Suche.
await indexStep(`Index ${TABLE}.idx_title_search`, {
  tableId: TABLE, key: 'idx_title_search', type: TablesDBIndexType.Fulltext, columns: ['title'],
})

console.log('✔ Migration posts-008 fertig')
