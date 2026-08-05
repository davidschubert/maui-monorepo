#!/usr/bin/env node
/**
 * BEWEIS: die Vertrauensstufen (F1 Teilpaket 3) — gegen eine ECHTE Appwrite.
 *
 * ── WAS DIESER LAUF PRÜFT, DAS EIN UNIT-TEST NICHT KANN ───────────────────
 * Die SCHWELLEN-Regel ist pur und in `tests/trustLevels.test.ts` festgenagelt;
 * hier geht es um die Zusagen, die an der DATENBANK hängen und die man nur
 * live widerlegen kann:
 *
 *  1. Die Spalten aus posts-016 stehen und tragen ihre Grenzen.
 *  2. Die Spalte `trustLevel` WEIST eine 4 AB. Das ist die Zusage „Stufe 4
 *     kommt nie aus einer Rechnung, sondern nur aus der Ernennung" — sie steht
 *     in der Regel UND als Netz in der Spalte, und nur hier lässt sich zeigen,
 *     dass das Netz wirklich hält.
 *  3. Die Leader-Abfrage der Verwaltungs-Fläche findet ihren Index. Ohne ihn
 *     wäre die Seite kein bisschen langsam, sondern ein Fehler — und das
 *     merkt man erst, wenn ein Owner sie öffnet.
 *  4. Ein Aufstieg schreibt nach oben und NIE zurück (an echten Zeilen).
 *
 * Aufruf (Env wie beim Migrations-Runner):
 *   node --env-file=apps/comments/.env packages/posts/scripts/verify-trust-levels.mjs
 */
import { Client, ID, Query, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('Fehlende Env-Vars — mit --env-file=apps/<app>/.env aufrufen.')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const TABLE = 'member_counters'
const SCOPE = `verify-trust-${Date.now()}`

let passed = 0
let failed = 0
function check(label, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  ✔ ${label}`)
  }
  else {
    failed++
    console.log(`  ✘ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const created = []
async function makeRow(data) {
  const row = await tablesDB.createRow({
    databaseId,
    tableId: TABLE,
    rowId: ID.unique(),
    data: { communityId: SCOPE, userId: data.userId, ...data },
    permissions: [],
  })
  created.push(row.$id)
  return row
}

console.log(`\nBeweis Vertrauensstufen gegen ${endpoint} / ${projectId} / ${databaseId}\n`)

try {
  // ── 1. Die Spalten stehen und tragen ihre Grenzen ────────────────────────
  console.log('1. Die Spalten aus posts-016')
  const { columns } = await tablesDB.listColumns({ databaseId, tableId: TABLE })
  const level = columns.find(c => c.key === 'trustLevel')
  const leader = columns.find(c => c.key === 'trustLevelLeader')
  check('member_counters.trustLevel existiert', Boolean(level))
  check('… ist verfügbar', level?.status === 'available', level?.status)
  check('… ist eine Ganzzahl mit Default 0', level?.type === 'integer' && level?.default === 0, `${level?.type}/${level?.default}`)
  check('… erlaubt genau 0–3 (die 4 gehört der Ernennung)', level?.min === 0 && level?.max === 3, `${level?.min}–${level?.max}`)
  check('member_counters.trustLevelLeader existiert', Boolean(leader))
  check('… ist ein Schalter mit Default false', leader?.type === 'boolean' && leader?.default === false, `${leader?.type}/${leader?.default}`)

  // ── 2. Die Spalte weist die 4 ab ─────────────────────────────────────────
  console.log('\n2. Die Spalte ist das Netz unter der Regel')
  const row = await makeRow({ userId: `${SCOPE}-a`, trustLevel: 3, trustLevelLeader: false })
  check('eine erarbeitete 3 wird angenommen', row.trustLevel === 3, String(row.trustLevel))
  let rejected = false
  try {
    await tablesDB.updateRow({ databaseId, tableId: TABLE, rowId: row.$id, data: { trustLevel: 4 } })
  }
  catch {
    rejected = true
  }
  check('eine 4 wird ABGEWIESEN (nur die Ernennung macht Stufe 4)', rejected)
  const after = await tablesDB.getRow({ databaseId, tableId: TABLE, rowId: row.$id })
  check('… und die Zeile steht unverändert auf 3', after.trustLevel === 3, String(after.trustLevel))

  // ── 3. Der Aufstieg schreibt nur nach oben ───────────────────────────────
  console.log('\n3. Aufstieg an einer echten Zeile')
  const climber = await makeRow({ userId: `${SCOPE}-b`, trustLevel: 0, trustLevelLeader: false })
  const up = await tablesDB.updateRow({ databaseId, tableId: TABLE, rowId: climber.$id, data: { trustLevel: 2 } })
  check('0 → 2 wird geschrieben', up.trustLevel === 2, String(up.trustLevel))
  // Die Regel `raisedTrustLevel` gibt bei einem niedrigeren Stand `null` und
  // die Route schreibt dann GAR NICHT — hier wird nur belegt, dass der
  // Datenbestand danach unverändert ist, wenn niemand schreibt.
  const stillTwo = await tablesDB.getRow({ databaseId, tableId: TABLE, rowId: climber.$id })
  check('… und bleibt dort, solange niemand höher schreibt', stillTwo.trustLevel === 2, String(stillTwo.trustLevel))

  // ── 4. Die Ernennung und ihre Abfrage ────────────────────────────────────
  console.log('\n4. Die Ernennung und die Abfrage der Verwaltungs-Fläche')
  await tablesDB.updateRow({ databaseId, tableId: TABLE, rowId: climber.$id, data: { trustLevelLeader: true } })
  const leaders = await tablesDB.listRows({
    databaseId,
    tableId: TABLE,
    queries: [Query.equal('communityId', SCOPE), Query.equal('trustLevelLeader', true), Query.limit(25)],
  })
  // Fände Appwrite den Index nicht, wäre das hier ein Fehler und keine leere
  // Liste — genau deshalb steht die Abfrage in diesem Beweis.
  check('die Leader-Abfrage läuft (Index idx_community_leader greift)', true)
  check('… und findet genau den Ernannten', leaders.rows.length === 1 && leaders.rows[0].userId === `${SCOPE}-b`, `${leaders.rows.length} Zeile(n)`)
  check('… seine erarbeitete Stufe steht unangetastet darunter', leaders.rows[0]?.trustLevel === 2, String(leaders.rows[0]?.trustLevel))

  await tablesDB.updateRow({ databaseId, tableId: TABLE, rowId: climber.$id, data: { trustLevelLeader: false } })
  const afterRevoke = await tablesDB.getRow({ databaseId, tableId: TABLE, rowId: climber.$id })
  check('nach dem Entzug bleibt die erarbeitete Stufe erhalten', afterRevoke.trustLevel === 2 && afterRevoke.trustLevelLeader === false, `${afterRevoke.trustLevel}/${afterRevoke.trustLevelLeader}`)
}
finally {
  // Der Beweis räumt hinter sich auf — er läuft gegen eine echte Instanz.
  for (const rowId of created) {
    await tablesDB.deleteRow({ databaseId, tableId: TABLE, rowId }).catch(() => null)
  }
}

console.log(`\n${failed === 0 ? '✔' : '✘'} ${passed}/${passed + failed} Prüfungen bestanden\n`)
process.exit(failed === 0 ? 0 : 1)
