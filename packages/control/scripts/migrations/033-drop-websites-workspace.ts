/**
 * Migration control-033: Nachlese zu A6 Schritt 5 — `websites.workspaceId` fällt.
 *
 * control-031 hat diese Spalte BEWUSST stehen gelassen (siehe dort „Was bewusst
 * STEHEN BLEIBT": das Betreiber-Register ist ein eigenes Thema, das Abräumen
 * gehört in einen eigenen Schritt mit eigener Begründung statt als Beifang).
 * Das ist dieser Schritt.
 *
 * DIE SPALTE IST TOT. Angelegt von control-006 (damals auf `sites`), beim
 * E8-Rename von 022-websites-rename mitkopiert. Ihr einziger Leser war
 * `applyWorkspacePlan` — mit A6 Schritt 5 gelöscht; die Dashboard-Zuordnung und
 * das PATCH-Schema sind ebenfalls raus. Geschrieben hat sie zuletzt niemand:
 * `websites/index.post.ts` setzt sie nicht (die Spalte ist optional, xdefault
 * ''), und ein `createRow<WebsiteRow>` gibt es im ganzen Repo nicht
 * (grep-belegt). Deshalb greift die Reihenfolge-Falle aus CLAUDE.md — Migration
 * VOR dem Code-Deploy, weil `createRow` alle Spalten explizit verlangt — hier
 * NICHT: die Reihenfolge ist egal.
 *
 * WELCHE TABELLE: wörtlich `websites`. Das ist der physische Name seit
 * control-022 (`sites` → `websites`), und dort hat 022 sowohl die Spalte als
 * auch `idx_workspace` angelegt; die alte Table `sites` ist mit control-026
 * gefallen. ACHTUNG, Stolperstein beim Lesen: die Konstante `WEBSITES_TABLE` in
 * packages/control/shared/types/website.ts trägt noch den Wert 'sites' — sie
 * wurde beim Rename nicht mitgezogen. Diese Migration folgt der DB, nicht der
 * Konstante.
 *
 * KEINE STRIPE-BREMSE, anders als in control-031: dort hingen an den
 * `workspaces`-Zeilen echte Abos, und ein Löschen hätte laufende Abbuchungen
 * ohne Gegenstück hinterlassen. Hier trägt die Spalte nur eine REFERENZ auf
 * eine bereits gelöschte Tabelle — an ihr hängt kein Abo, es gibt also nichts
 * zu bremsen.
 *
 * IDEMPOTENT über 404. Auf einem frischen Bootstrap legen control-006/022 die
 * Objekte weiter an (Protokoll) und diese räumt sie ab — jede Instanz erreicht
 * denselben Endzustand.
 *
 *   pnpm migrate --app control --layer control
 */
import { Client, Query, TablesDB } from 'node-appwrite'

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

const db = databaseId
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

const TABLE = 'websites'

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function step(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 404)) {
      console.log(`↷ ${label} (schon weg)`)
      return
    }
    throw error
  }
}

console.log(`Migration control-033 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

// ── Indizes auf websites.workspaceId zuerst ─────────────────────────────────
// Ein Index auf der Spalte verhindert ihr Löschen. Nicht raten, welche es gibt:
// nachsehen. Erwartet wird genau `idx_workspace` (control-006, von control-022
// mitkopiert). Query.limit(200): die Default-Seite ist 25 — ein übersehener
// Index würde das Löschen der Spalte scheitern lassen, und zwar erst ganz am
// Ende.
const indexes = await tablesDB.listIndexes({
  databaseId: db, tableId: TABLE, queries: [Query.limit(200)],
}).catch((error) => {
  if (hasCode(error, 404)) return null
  throw error
})
for (const index of indexes?.indexes ?? []) {
  if (!index.columns.includes('workspaceId')) continue
  // destruktiv-ok: der Index zeigt auf eine Spalte, die in derselben Migration
  // fällt — ohne ihn kann sie gar nicht gelöscht werden.
  await step(`Index ${TABLE}.${index.key} löschen`, () => tablesDB.deleteIndex({
    databaseId: db, tableId: TABLE, key: index.key,
  }))
}

// ── Die Spalte ──────────────────────────────────────────────────────────────
// destruktiv-ok: `websites.workspaceId` ist seit A6 Schritt 5 tot — kein Code
// liest oder schreibt sie mehr (Leser `applyWorkspacePlan`, Dashboard-Zuordnung
// und PATCH-Schema sind gelöscht; grep-Beweis im selben Commit). Ihr Inhalt
// zeigte auf `workspaces`, und die Tabelle ist mit control-031 gefallen — die
// Spalte verweist also ohnehin nur noch ins Leere.
await step(`Column ${TABLE}.workspaceId löschen`, () => tablesDB.deleteColumn({
  databaseId: db, tableId: TABLE, key: 'workspaceId',
}))

console.log('✔ Migration control-033 fertig — die letzte Workspace-Spur im Register ist weg.')
