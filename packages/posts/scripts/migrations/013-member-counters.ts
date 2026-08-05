/**
 * Migration posts-013: `member_counters` — die MITSCHREIBENDEN Zähler
 * (F1, gemeinsames Paket aus Konzept Teil 5, Punkte 4–6).
 *
 * ── KEIN BACKFILL, UND ZWAR MIT BEGRÜNDUNG ────────────────────────────────
 * Wie posts-012 legt diese Migration eine NEUE Tabelle an und rührt keine
 * bestehende Zeile an — es gibt also nichts nachzutragen. Die interessantere
 * Frage ist die andere: warum werden die BESTEHENDEN Verdienste nicht in
 * Startwerte umgerechnet?
 *
 * Weil ein Massenlauf hier nicht geht und auch nicht gut ausginge:
 *  - Die Zeilen liegen in JEDEM Runtime-Projekt einzeln (Pool und jede
 *    Silo-Instanz). Ein Lauf bekommt genau EINEN Schlüssel für EINE Instanz.
 *  - Er müsste über alle Mitglieder aller Communities rechnen — eine Liste, die
 *    dieses Projekt gar nicht kennt: `community_members` steht im Control
 *    Plane, hier stehen nur Inhalte. Er müsste die Mitglieder also aus
 *    vorhandenen Zeilen erraten und verfehlte ausgerechnet die Stillen.
 *  - Und er wäre in dem Moment veraltet, in dem der nächste Mensch schreibt.
 * Deshalb LAZY SEED: beim ersten Hinsehen, für genau einen Menschen, genau
 * einmal (`server/utils/memberCounters.ts`). Wer 200 Upvotes vergeben hat,
 * bevor es diese Tabelle gab, bekommt sie beim ersten Öffnen der
 * Abzeichen-Seite gutgeschrieben.
 *
 * ── EINE ZEILE JE (Community, Nutzer) ─────────────────────────────────────
 * Der Unique-Index ist wieder die eigentliche Mechanik: geschrieben wird blind,
 * ein 409 heißt „jemand war schneller". Ohne ihn erzeugten zwei gleichzeitige
 * Stimmen zwei Zeilen, und ab da zählte jede Hälfte für sich.
 *
 * DER MANDANT GEHÖRT IN DEN SCHLÜSSEL (Pool-Unique-Regel): dieselbe Person kann
 * in zwei Communities des Pools aktiv sein, und was sie dort getan hat, ist
 * verschieden. Ein Schlüssel nur über `userId` hätte die erste Community
 * entscheiden lassen, was in der zweiten gilt.
 *
 * WARUM DIE ZEILEN-ID NICHT AUS (communityId, userId) GEBAUT WIRD, obwohl das
 * den Index sparte (Muster `post_views`, wo `rowId = postId` ist): eine
 * Appwrite-Id fasst 36 Zeichen, zwei Ids zusammen sind bis zu 73. Ein Kürzel
 * daraus (Hash) wäre eine zweite, unlesbare Wahrheit über die Zugehörigkeit.
 *
 * ── KEIN EIGENER LESE-INDEX ───────────────────────────────────────────────
 * Es gibt genau EINE Leseabfrage („die Zeile dieses Menschen hier"), und die
 * bedient der Unique-Index über (communityId, userId) als Präfix. Ein zweiter
 * Index daneben wäre Schreiblast ohne Leser.
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

const TABLE = 'member_counters'

/** Die additiv geführten Spalten (Spiegel von MEMBER_COUNTER_COLUMNS). */
const COUNTER_COLUMNS = [
  'topicsCreated',
  'repliesCreated',
  'upvotesGiven',
  'upvotesReceived',
  'edits',
] as const

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

console.log(`Migration posts-013 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// rowSecurity, Table-Permissions leer: geschrieben und gelesen wird
// ausschließlich server-seitig über die Operator-Klinke. Die Zeilen bekommen
// bewusst GAR KEINE Row-Permissions — ohne Leser kein Realtime-Ereignis, und
// ein Zähler, der bei jeder fremden Stimme in offene Fenster funkt, wäre
// Aufregung ohne Neuigkeit (dieselbe Überlegung wie bei `post_views`).
await step(`Table ${TABLE}`, () => tablesDB.createTable({
  databaseId, tableId: TABLE, name: 'Member Counters',
  permissions: [], rowSecurity: true,
}))

const cols = await existingColumnKeys(TABLE)

await columnStep(`Column ${TABLE}.communityId`, 'communityId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'communityId', size: 36, required: false, xdefault: '',
}))
await columnStep(`Column ${TABLE}.userId`, 'userId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'userId', size: 36, required: false, xdefault: '',
}))

for (const key of COUNTER_COLUMNS) {
  // `required: false` mit `xdefault: 0` — eine Pflicht-Spalte ohne Default
  // machte jede künftige additive Erweiterung zum Bruch.
  //
  // `min: 0` ZUSÄTZLICH zur Untergrenze des Schreibwegs
  // (`decrement({ min: 0 })`), und das ist keine Dopplung, sondern dieselbe
  // Staffelung wie bei `comments.upvotes`: der Schreibweg ist die Regel, die
  // Spalte ist das Netz. Eine negative Anzahl gibt es nicht — wenn ein
  // künftiger Pfad sie versucht, soll er scheitern und nicht eine Zahl
  // hinterlassen, die niemand mehr erklären kann.
  await columnStep(`Column ${TABLE}.${key}`, key, cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: TABLE, key, required: false, min: 0, xdefault: 0,
  }))
}

// `seeded` unterscheidet „Zeile existiert" von „Startwerte stehen". Ohne diese
// Spalte wäre die erste vergebene Stimme eines langjährigen Mitglieds sein
// ganzer Stand — und ein längst verdientes Abzeichen dauerhaft weg.
await columnStep(`Column ${TABLE}.seeded`, 'seeded', cols, () => tablesDB.createBooleanColumn({
  databaseId, tableId: TABLE, key: 'seeded', required: false, xdefault: false,
}))

await waitForColumns(TABLE)

// Die Mechanik: blind anlegen, 409 heißt „jemand war schneller". Trägt zugleich
// die einzige Leseabfrage („die Zeile dieses Menschen hier") als Präfix.
await indexStep(`Unique-Index ${TABLE}.uq_community_user`, {
  tableId: TABLE, key: 'uq_community_user', type: TablesDBIndexType.Unique,
  columns: ['communityId', 'userId'],
})

console.log('✔ Migration posts-013 fertig')
