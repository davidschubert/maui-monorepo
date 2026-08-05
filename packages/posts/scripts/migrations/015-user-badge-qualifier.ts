/**
 * Migration posts-015: `user_badges.qualifier` — Abzeichen mehrfach verleihen
 * (F1 Teilpaket 2, Konzept Teil 5 / Davids Entscheidung vom 2026-08-04).
 *
 * ── WAS SICH ÄNDERT ───────────────────────────────────────────────────────
 * Bis hierher galt „ein Abzeichen genau einmal", und der Unique-Index
 * (communityId, userId, badgeKey) hat das durchgesetzt. Davids Entscheidung
 * dreht das um: wo es ein NEUES qualifizierendes Ereignis gibt, kommt das
 * Abzeichen wieder. Das Ereignis braucht ein Merkmal, sonst ist die zweite
 * Verleihung von einer Dublette nicht zu unterscheiden — `qualifier`:
 *  - Row-Id des Inhalts, der die Schwelle gerissen hat (Posting-Gruppe),
 *  - Nummer des Mitgliedsjahres (Jahrestag),
 *  - `''` bei einmaligen Abzeichen.
 *
 * ── DER INDEX-WECHSEL: NEUER ZUERST, ALTER DANACH ─────────────────────────
 * Der alte Index MUSS weg (er verböte jede zweite Verleihung), aber nie vor dem
 * neuen: zwischen „alter weg" und „neuer da" stünde die Tabelle ohne Netz, und
 * genau in dieses Fenster fallen die blinden Schreibversuche der Verleihung.
 * Beide Indizes gleichzeitig sind unschädlich — solange der alte steht, ist die
 * Verleihung strenger als nötig, nicht laxer.
 *
 * ── DER BACKFILL IST HIER PFLICHT (Lehre aus posts-011) ───────────────────
 * Appwrite/MariaDB setzt Defaults nur für NEUE Zeilen; Bestandszeilen bekommen
 * NULL. Beim „bearbeitet"-Zeitstempel (posts-014) war das die gewollte Aussage
 * — hier wäre es ein Loch: in einem Unique-Index kollidiert NULL mit NICHTS,
 * auch nicht mit einem zweiten NULL. Eine Bestandszeile (NULL) würde eine
 * frische Verleihung mit `''` also nicht abwehren, und ein einmaliges Abzeichen
 * stünde zweimal da. Deshalb bekommt jede Bestandszeile ausdrücklich `''`.
 *
 * Der Lauf ist idempotent, weil er nur Zeilen anfasst, die noch NULL tragen —
 * ein zweiter Durchgang findet keine mehr. Und er ist klein: `user_badges`
 * entstand mit posts-012.
 *
 * ── WAS DER BACKFILL BEDEUTET ─────────────────────────────────────────────
 * Eine Bestandszeile heißt „einmal verliehen, wofür genau ist nicht
 * festgehalten" — die Verleihung rechnete damals über Aggregate, die zählen und
 * nicht benennen. Beim JAHRESTAG wird `''` deshalb als „Jahr 1" gelesen
 * (`membershipYearOf`), sonst käme der erste Jahrestag ein zweites Mal. Bei den
 * Posting-Abzeichen bleibt sie die erste Verleihung; jede weitere kommt vom
 * Schreibweg, der den Inhalt benennen kann.
 *
 * Index-Anlage NUR über die Fabrik (F19), Löschen ist davon nicht betroffen.
 *
 *   pnpm migrate --app <app> --layer posts
 */
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
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
const OLD_INDEX = 'uq_community_user_badge'
const NEW_INDEX = 'uq_community_user_badge_qual'

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
async function waitForColumn(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    const column = (columns as unknown as { key: string, status: string }[]).find(c => c.key === key)
    if (column?.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Column ${tableId}.${key} wurde nicht 'available'`)
}

console.log(`Migration posts-015 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// 36 Zeichen: das größte Merkmal ist eine Appwrite-Row-Id. Eine Jahres-Nummer
// passt mühelos hinein, und der Index bleibt weit unter dem Zeilenbudget.
const cols = await existingColumnKeys(TABLE)
if (cols.has('qualifier')) {
  console.log(`↷ Column ${TABLE}.qualifier (existiert bereits)`)
}
else {
  await step(`Column ${TABLE}.qualifier`, () => tablesDB.createVarcharColumn({
    databaseId, tableId: TABLE, key: 'qualifier', size: 36, required: false, xdefault: '',
  }))
}
await waitForColumn(TABLE, 'qualifier')

// ZUERST der neue Index — erst wenn er steht, darf der alte fallen.
await indexStep(`Unique-Index ${TABLE}.${NEW_INDEX}`, {
  tableId: TABLE, key: NEW_INDEX, type: TablesDBIndexType.Unique,
  columns: ['communityId', 'userId', 'badgeKey', 'qualifier'],
})

// Backfill: jede Bestandszeile bekommt '' — Begründung im Kopf.
let filled = 0
for (let page = 0; page < 1000; page++) {
  const { rows } = await tablesDB.listRows({
    databaseId, tableId: TABLE, queries: [Query.isNull('qualifier'), Query.limit(100)],
  })
  if (rows.length === 0) break
  for (const row of rows) {
    await tablesDB.updateRow({ databaseId, tableId: TABLE, rowId: row.$id, data: { qualifier: '' } })
    filled++
  }
}
console.log(`✔ Backfill ${TABLE}.qualifier: ${filled} Bestandszeile(n) auf '' gesetzt`)

// ERST JETZT der alte Index — er verböte sonst jede zweite Verleihung.
//
// destruktiv-ok: `uq_community_user_badge` wird durch
// `uq_community_user_badge_qual` ERSETZT (oben zuerst angelegt, Backfill
// dazwischen). Der neue deckt dieselben drei Spalten plus `qualifier` und ist
// damit strikt feiner — es entsteht kein Fenster ohne Eindeutigkeit, und ohne
// das Löschen bliebe jede zweite Verleihung dauerhaft am 409 hängen. Zeilen
// werden nicht angefasst.
try {
  await tablesDB.deleteIndex({ databaseId, tableId: TABLE, key: OLD_INDEX })
  console.log(`✔ Alter Unique-Index ${TABLE}.${OLD_INDEX} entfernt`)
}
catch (error) {
  if (hasCode(error, 404)) console.log(`↷ Alter Unique-Index ${TABLE}.${OLD_INDEX} (schon weg)`)
  else throw error
}

console.log('✔ Migration posts-015 fertig')
