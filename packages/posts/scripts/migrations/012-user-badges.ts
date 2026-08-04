/**
 * Migration posts-012: `user_badges` — die verliehenen Abzeichen (F1 Stufe 4).
 *
 * ── KEIN BACKFILL, und diesmal stimmt der Satz ────────────────────────────
 * posts-011 stand einen Tag lang mit „KEIN BACKFILL NOETIG" hier und war
 * falsch: Appwrite/MariaDB setzt Defaults nur fuer NEUE Zeilen, Bestandszeilen
 * bekamen NULL, und der Zustands-Filter log. Deshalb ausdruecklich: diese
 * Migration legt eine NEUE Tabelle an und fuegt KEINE Spalte zu einer
 * bestehenden hinzu. Es gibt keine Bestandszeile, die etwas nachgetragen
 * bekommen muesste.
 *
 * Was es stattdessen zu wissen gibt: Abzeichen fuer BESTEHENDE Verdienste
 * werden nicht nachgetragen, sondern beim ersten Aufruf der Abzeichen-Seite
 * VERLIEHEN — die Auswertung rechnet ueber den vollen Bestand (Stimmen,
 * Beitraege, Meldungen), nicht ab heute. Wer 200 Upvotes gesammelt hat, bevor
 * es Abzeichen gab, bekommt seine sofort.
 *
 * ── EINE ZEILE JE (Community, Nutzer, Abzeichen) ──────────────────────────
 * Der Unique-Index ist die eigentliche Mechanik: die Verleihung schreibt
 * blind und behandelt 409 als „hat er schon". Ohne ihn muesste jeder Aufruf
 * erst lesen und dann schreiben — genau das Muster, das bei nebenlaeufigen
 * Requests doppelte Zeilen erzeugt.
 *
 * DER MANDANT GEHOERT IN DEN SCHLUESSEL: dieselbe Person kann in zwei
 * Communities des Pools aktiv sein, und ihre Abzeichen sind dort verschieden
 * verdient. Ein Schluessel ohne `communityId` haette die erste Community
 * entscheiden lassen, was in der zweiten gilt (Pool-Unique-Regel).
 *
 * ── ZWEI INDIZES, DIE NICHT ZU DIESER TABELLE GEHOEREN ────────────────────
 * Die Zaehl-Quellen fragen `community_posts` nach „meine Beitraege mit ≥N
 * Upvotes" und `post_votes` nach „meine vergebenen Upvotes". Beide Abfragen
 * gab es vorher nicht: `idx_author` deckt nur `authorId` (ohne Mandant und
 * ohne Stimmen), und `post_votes` hatte gar keinen Zugriff ueber den Nutzer.
 * Die Indizes stehen hier statt in einer eigenen Migration, weil sie ohne
 * diese Tabelle keinen Konsumenten haetten.
 *
 * Idempotent (409 → skip). Index-Anlage NUR ueber die Fabrik (F19).
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

const TABLE = 'user_badges'
const POSTS_TABLE = 'community_posts'
const VOTES_TABLE = 'post_votes'

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

console.log(`Migration posts-012 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// rowSecurity, Table-Permissions leer: geschrieben wird ausschließlich
// server-seitig (die Verleihung ist kein Schreibvorgang des Mitglieds), gelesen
// über die Row-Permissions, die die Datentür setzt.
await step(`Table ${TABLE}`, () => tablesDB.createTable({
  databaseId, tableId: TABLE, name: 'User Badges',
  permissions: [], rowSecurity: true,
}))

const cols = await existingColumnKeys(TABLE)

await columnStep(`Column ${TABLE}.communityId`, 'communityId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'communityId', size: 36, required: false, xdefault: '',
}))
await columnStep(`Column ${TABLE}.userId`, 'userId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'userId', size: 36, required: false, xdefault: '',
}))
// 64 statt 36: der Schlüssel ist ein Katalog-Name („great-reply"), keine Row-Id.
await columnStep(`Column ${TABLE}.badgeKey`, 'badgeKey', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'badgeKey', size: 64, required: false, xdefault: '',
}))

await waitForColumns(TABLE)

// Die Mechanik der Verleihung: blind schreiben, 409 heißt „hat er schon".
await indexStep(`Unique-Index ${TABLE}.uq_community_user_badge`, {
  tableId: TABLE, key: 'uq_community_user_badge', type: TablesDBIndexType.Unique,
  columns: ['communityId', 'userId', 'badgeKey'],
})
// Die eine Leseabfrage: „welche Abzeichen hat dieser Mensch hier?"
await indexStep(`Index ${TABLE}.idx_community_user`, {
  tableId: TABLE, key: 'idx_community_user', type: TablesDBIndexType.Key,
  columns: ['communityId', 'userId'],
})

// „Wie viele MEINER Beiträge haben mindestens N Upvotes?" — sechs Schwellen,
// sechs Abfragen, alle über diese drei Spalten.
await indexStep(`Index ${POSTS_TABLE}.idx_community_author_upvotes`, {
  tableId: POSTS_TABLE, key: 'idx_community_author_upvotes', type: TablesDBIndexType.Key,
  columns: ['communityId', 'authorId', 'upvotes'],
})
// „Wie viele Upvotes habe ICH vergeben?" — bisher gab es keinen Zugriff auf
// post_votes über den Nutzer (uq_post_user beginnt mit postId).
await indexStep(`Index ${VOTES_TABLE}.idx_community_user_value`, {
  tableId: VOTES_TABLE, key: 'idx_community_user_value', type: TablesDBIndexType.Key,
  columns: ['communityId', 'userId', 'value'],
})

console.log('✔ Migration posts-012 fertig')
