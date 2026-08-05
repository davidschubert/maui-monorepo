/**
 * Migration posts-014: `community_posts.editedAt` — der ehrliche
 * „bearbeitet"-Hinweis am Thema (F1, Konzept Teil 5, Entscheidung 4).
 *
 * ── DIE SCHULD, DIE DAS BEGLEICHT ─────────────────────────────────────────
 * `comments` hat diese Spalte seit comments-005, `posts` nie. Zwei Folgen, und
 * beide standen bis heute so im Repo:
 *  - am Thema fehlte der Hinweis, den jede Antwort darunter trug,
 *  - das Abzeichen „Editor" war ausdrücklich als NICHT BAUBAR vermerkt (Kopf
 *    von `shared/badges.ts`), weil `community_posts` keine Bearbeitung
 *    festhält. Mit dieser Spalte ist es baubar — und es zählt beide
 *    Inhaltsarten, statt „Beitrag" zu sagen und Antworten zu meinen.
 *
 * ── WARUM NICHT EINFACH `$updatedAt` ──────────────────────────────────────
 * Weil das eine ANDERE Frage beantwortet. `$updatedAt` bewegt sich bei jeder
 * Stimme (score.post.ts schreibt upvotes/downvotes/score auf die Zeile), beim
 * Anheften, beim Schließen, beim Umkategorisieren und beim Veröffentlichen
 * eines geplanten Beitrags. Ein daraus abgeleitetes „bearbeitet" stünde an
 * Themen, an deren Text nie jemand war. Dasselbe Argument hat schon
 * `lastActivityAt` (posts-009) nötig gemacht.
 *
 * ── KEIN BACKFILL, UND DIESMAL IST DAS RICHTIG ────────────────────────────
 * posts-011 hat gelehrt, dass Appwrite/MariaDB Defaults nur für NEUE Zeilen
 * setzt und Bestandszeilen `NULL` bekommen. Hier ist `NULL` der GEWOLLTE Wert:
 * er heißt „nie bearbeitet", und das ist über den ganzen Bestand die einzige
 * ehrliche Aussage — ob vor dieser Migration jemand nachgebessert hat, ist
 * nirgends festgehalten.
 *
 * Der zweite Teil der posts-011-Lehre trifft hier NICHT zu: die Spalte wird
 * nicht gefiltert und nicht sortiert. Sie wird angezeigt, und die Anzeige
 * fragt `v-if` — `NULL` ist dort schlicht „kein Hinweis". Es gibt also keine
 * Abfrage, die Zeilen mit `NULL` fallen lassen könnte.
 *
 * ── REIHENFOLGE: MIGRATION ZUERST, DEPLOY DANACH ──────────────────────────
 * `editedAt` ist im Typ `CommunityPost` PFLICHT (dieselbe Entscheidung wie bei
 * `categoryId` und den drei Zuständen), also stempelt `POST /api/posts` sie ab
 * dem Deploy bei jedem neuen Beitrag mit. Läuft der Code vor der Migration,
 * schlägt das Anlegen fehl.
 *
 * KEIN INDEX: es gibt keine Abfrage über diese Spalte, nur eine Anzeige. Ein
 * Index auf Vorrat verteuert jeden Schreibvorgang, ohne je gemessen zu sein.
 *
 * Idempotent (409 → skip).
 *
 *   pnpm migrate --app <app> --layer posts
 */
import { Client, TablesDB } from 'node-appwrite'

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

console.log(`Migration posts-014 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// Leer-fähig ohne Default: `null` IST die Aussage („nie bearbeitet"). Genau die
// Form, die `comments.editedAt` seit comments-005 hat.
await step(`Column ${TABLE}.editedAt`, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: TABLE, key: 'editedAt', required: false,
}))
await waitForColumn(TABLE, 'editedAt')

console.log('✔ Migration posts-014 fertig')
