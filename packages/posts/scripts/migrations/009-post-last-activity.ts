/**
 * Migration posts-009: `community_posts.lastActivityAt` — wann an einem Beitrag
 * zuletzt etwas los war (F1 Stufe 2, Aktivitäts-Vertrag).
 *
 * REIHENFOLGE: MIGRATION ZUERST, DEPLOY DANACH — und hier ist das kein
 * Ratschlag. `CommunityPost.lastActivityAt` ist im Typ PFLICHT, also stempelt
 * `POST /api/posts` die Spalte ab dem Deploy bei JEDEM neuen Beitrag mit. Läuft
 * der Code vor der Migration, schlägt das Anlegen eines Beitrags fehl —
 * dieselbe Falle wie bei posts-008 und bei jeder neuen `communities`-Spalte.
 *
 * BEKANNTES FENSTER (bewusst hingenommen): zwischen Migration und Deploy legt
 * der ALTE Code Beiträge ohne `lastActivityAt` an. Die ANZEIGE fängt das über
 * die Rückfall-Kette `topicActivityAt()` ab; die SORTIERUNG „Neueste" kann es
 * nicht (Appwrite kennt kein COALESCE), diese wenigen Zeilen stehen also für
 * ein paar Minuten am Ende der Liste. Der Preis für die Alternative wäre eine
 * zweite Sortier-Spalte, die man ewig doppelt pflegt.
 *
 * DER BACKFILL IST DER EIGENTLICHE INHALT DIESER DATEI. Ohne ihn stünde JEDER
 * Bestands-Beitrag mit `null` in der Spalte und fiele beim Sortieren nach
 * „Neueste" ans Ende — die Discussions sähen am Tag des Deploys aus, als wäre
 * nie etwas passiert. Gesetzt wird `publishedAt` (sonst `$createdAt`): das ist
 * die letzte Aktivität, die wir für Bestand EHRLICH kennen. Antworten werden
 * NICHT nachgerechnet — dafür müsste diese Migration die Kommentar-Tabelle
 * eines anderen Layers lesen, und ein Migrations-Skript ist der schlechteste
 * Ort für eine Cross-Layer-Kopplung. Der erste neue Kommentar zieht den Wert
 * ohnehin richtig nach.
 *
 * Der Backfill läuft MANDANTENÜBERGREIFEND und mit dem Migrations-Key — das ist
 * an dieser Stelle ausdrücklich erlaubt (CLAUDE.md: „AUSSERHALB der Tür erlaubt:
 * Migrationen"). Er ist idempotent: nur Zeilen OHNE Wert werden angefasst, ein
 * zweiter Lauf findet nichts mehr.
 *
 * Idempotent (409 → skip). Index-Anlage NUR über die Fabrik (F19).
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

const TABLE = 'community_posts'
const COLUMN = 'lastActivityAt'

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

console.log(`Migration posts-009 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// Datetime wie publishedAt/scheduledAt — KEIN Default: `null` ist hier eine
// echte Aussage („noch nie"), und ein Default würde geplante Beiträge mit einer
// Aktivität ausstatten, die es nicht gab.
await step(`Column ${TABLE}.${COLUMN}`, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: TABLE, key: COLUMN, required: false,
}))
await waitForColumn(TABLE, COLUMN)

/**
 * BACKFILL — seitenweise über den Cursor, nicht über `offset`.
 *
 * Grund: der Filter ist `isNull(lastActivityAt)`, und jede geschriebene Zeile
 * VERLÄSST damit die Treffermenge. Mit `offset` würde bei jeder Seite die Hälfte
 * übersprungen (die klassische Falle beim Backfill über den eigenen Filter);
 * ohne Offset ist „immer die erste Seite holen" korrekt und terminiert, weil
 * die Menge in jedem Durchlauf kleiner wird.
 *
 * `$createdAt` als zweiter Rückfall: ein Beitrag ohne `publishedAt` ist geplant
 * oder ein Entwurf aus der Frühzeit — für den ist das Anlegen die letzte
 * bekannte Regung.
 */
const PAGE = 100
let touched = 0
let guard = 0
for (;;) {
  // 10.000 Zeilen sind das Vielfache des heutigen Bestands; die Schranke ist
  // nicht das Ziel, sondern der Schutz gegen eine Endlosschleife, falls ein
  // Schreibvorgang stillschweigend nichts ändert.
  if (guard++ > 100) {
    console.warn(`⚠️  Backfill nach ${touched} Zeilen abgebrochen (Schleifen-Schranke) — Migration erneut laufen lassen.`)
    break
  }

  const { rows } = await tablesDB.listRows<{ $id: string, $createdAt: string, publishedAt: string | null }>({
    databaseId,
    tableId: TABLE,
    queries: [Query.isNull(COLUMN), Query.limit(PAGE)],
  })
  if (rows.length === 0) break

  for (const row of rows) {
    await tablesDB.updateRow({
      databaseId,
      tableId: TABLE,
      rowId: row.$id,
      data: { [COLUMN]: row.publishedAt ?? row.$createdAt },
    })
    touched++
  }
  console.log(`  … ${touched} Zeilen nachgetragen`)
}
console.log(`✔ Backfill ${TABLE}.${COLUMN} (${touched} Zeilen)`)

/**
 * „Neueste" sortiert innerhalb einer Community (und optional einer Kategorie)
 * nach genau dieser Spalte — derselbe Zuschnitt wie `idx_community_category`
 * aus posts-008, nur mit der neuen Sortier-Spalte am Ende.
 *
 * Der ALTE Index bleibt: er trägt weiterhin die Kategorie-Zählung und jede
 * Abfrage, die nach `publishedAt` filtert (das Zeitfenster von „Top", der
 * Filter `created-after`). Zwei Indizes auf derselben Tabelle sind hier billiger
 * als ein Filesort über die Beiträge einer aktiven Community.
 */
await indexStep(`Index ${TABLE}.idx_community_activity`, {
  tableId: TABLE, key: 'idx_community_activity', type: TablesDBIndexType.Key,
  columns: ['communityId', 'categoryId', COLUMN],
})

console.log('✔ Migration posts-009 fertig')
