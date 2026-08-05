/**
 * Migration posts-016: `member_counters.trustLevel` + `.trustLevelLeader` —
 * die VERTRAUENSSTUFEN (F1 Teilpaket 3, Davids Entscheidungen vom 2026-08-04).
 *
 * ── ZWEI SPALTEN, WEIL ES ZWEI VERSCHIEDENE AUSSAGEN SIND ─────────────────
 * Davids Regel lautet „Stufe = max(gespeichert, TL4-Ernennung); automatisch
 * berechnete Stufen steigen nie ab". Eine einzige Spalte kann das nicht:
 *
 *  - `trustLevel` (0–3) ist das ERARBEITETE. Sie wird nur nach OBEN
 *    geschrieben und niemals gesenkt — auch nicht, wenn Zähler einmal
 *    zurückgehen (zurückgenommene Stimme) oder das Beitrittsdatum gerade nicht
 *    lesbar ist. Eine 4 steht hier nie: Stufe 4 verdient man nicht.
 *  - `trustLevelLeader` ist die ERNENNUNG durch den Owner, und sie ist
 *    ausdrücklich rücknehmbar („Entzug von TL4 ist erlaubt, es ist eine
 *    Ernennung").
 *
 * Mit nur EINER Spalte müsste der Entzug die erarbeitete Stufe neu ausrechnen,
 * um nicht auf 0 zu fallen — und diese Rechnung braucht das Beitrittsdatum aus
 * dem Control Plane, das fail-soft „unbekannt" sein darf. Ein Owner, der einem
 * Leader die Ernennung nimmt, hätte ihm dann bei schlechter Verbindung
 * zugleich seine über Jahre erarbeitete Stufe 3 genommen, lautlos und ohne Weg
 * zurück (kein Abstieg heißt: es wächst nicht von selbst nach). Zwei Spalten
 * kosten ein paar Bytes und machen den Entzug zu dem, was er ist: das
 * Zurücknehmen genau einer Entscheidung.
 *
 * ── KEIN BACKFILL, UND DIESMAL IST ES WIRKLICH KEINER ─────────────────────
 * Beide Spalten sind ADDITIV mit Default. Bestandszeilen bekommen von
 * Appwrite/MariaDB NULL statt des Defaults (Lehre aus posts-011/015) — das ist
 * hier bewusst in Ordnung und kein Loch wie beim `qualifier`:
 *  - Sie stehen in KEINEM Unique-Index, wo NULL mit nichts kollidieren würde.
 *  - Die Leseseite normalisiert jede unbrauchbare Zahl auf 0
 *    (`normalizeTrustLevel` in core/shared/trustLevel.ts). NULL heißt also
 *    „keine Stufe", und das ist für eine Bestandszeile die WAHRHEIT: die Stufe
 *    wurde für diesen Menschen noch nie gerechnet.
 *  - Beim ersten Hinsehen (Abzeichen-Galerie) und beim nächsten Schreibvorgang
 *    rechnet sie sich aus den vorhandenen Zählern von selbst zusammen — genau
 *    der Lazy-Seed-Weg, den posts-013 für dieselbe Tabelle begründet hat. Wer
 *    lange dabei ist und viel geschrieben hat, springt dabei sofort auf seine
 *    Stufe; ein Massenlauf über alle Instanzen und alle Mitglieder ist aus
 *    denselben drei Gründen wie dort keine Option.
 *
 * ── DER EINE INDEX, UND WARUM ES IHN GIBT ─────────────────────────────────
 * posts-013 kam bewusst ohne Lese-Index aus: es gab genau EINE Abfrage („die
 * Zeile dieses Menschen"), und die bedient der Unique-Index als Präfix. Mit
 * diesem Teilpaket kommt eine ZWEITE dazu, die er nicht bedient: „wer ist hier
 * Leader?" (die Verwaltungs-Fläche des Owners). Appwrite verlangt für ein
 * `Query.equal` auf einer Spalte einen Index — ohne ihn wäre die Seite nicht
 * ein bisschen langsam, sondern ein Fehler.
 *
 * Index-Anlage NUR über die Fabrik (F19).
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
async function waitForColumn(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    const column = (columns as unknown as { key: string, status: string }[]).find(c => c.key === key)
    if (column?.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Column ${tableId}.${key} wurde nicht 'available'`)
}

console.log(`Migration posts-016 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const cols = await existingColumnKeys(TABLE)

/**
 * `min: 0, max: 3` — die Spalte trägt die Grenze noch einmal, die die Regel
 * schon setzt (dieselbe Staffelung wie bei den Zähler-Spalten aus posts-013:
 * der Schreibweg ist die Regel, die Spalte das Netz). Die 4 ist hier
 * ausdrücklich AUSGESCHLOSSEN: sie kommt nie aus einer Rechnung, sondern
 * ausschließlich aus `trustLevelLeader`. Ein künftiger Pfad, der versucht, eine
 * 4 hierher zu schreiben, soll scheitern statt eine Zahl zu hinterlassen, die
 * die Ernennung umgeht.
 */
await columnStep(`Column ${TABLE}.trustLevel`, 'trustLevel', cols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: TABLE, key: 'trustLevel', required: false, min: 0, max: 3, xdefault: 0,
}))

await columnStep(`Column ${TABLE}.trustLevelLeader`, 'trustLevelLeader', cols, () => tablesDB.createBooleanColumn({
  databaseId, tableId: TABLE, key: 'trustLevelLeader', required: false, xdefault: false,
}))

await waitForColumn(TABLE, 'trustLevel')
await waitForColumn(TABLE, 'trustLevelLeader')

// „Wer ist hier Leader?" — die Verwaltungs-Fläche des Owners. Der Mandant steht
// vorne, weil die Datentür ihn immer mitfragt (Pool-Regel).
await indexStep(`Index ${TABLE}.idx_community_leader`, {
  tableId: TABLE, key: 'idx_community_leader', type: TablesDBIndexType.Key,
  columns: ['communityId', 'trustLevelLeader'],
})

console.log('✔ Migration posts-016 fertig')
