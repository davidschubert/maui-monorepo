/**
 * Migration posts-011: `community_posts.pinned` · `.closed` · `.solved` — die
 * Zustände eines Themas (F1 Stufe 3, Stück 1).
 *
 * ── WARUM DREI EIGENE SPALTEN UND NICHT DREI WEITERE `status`-WERTE ─────────
 * Die naheliegende Idee ist, `status` zu erweitern — es ist ja schon ein
 * Zustand, und LIVE NACHGEMESSEN (2026-08-04, Migrations-Key gegen die
 * Dev-Instanz) ist die Spalte ein `varchar(12)`, KEIN Enum. Technisch stünde
 * dem also nichts im Weg; 'closed' und 'pinned' passen in zwölf Zeichen.
 * Trotzdem ist es falsch, und zwar aus drei Gründen:
 *
 *  1. `published | hidden | deleted` sind EINANDER AUSSCHLIESSEND — ein
 *     Beitrag ist genau eines davon. „Angeheftet", „geschlossen" und „gelöst"
 *     sind es NICHT: ein geschlossenes Thema ist weiterhin veröffentlicht, ein
 *     angeheftetes kann zugleich geschlossen und gelöst sein. Vier Zustände in
 *     ein Feld zu zwängen, das nur einen tragen kann, hieße, sie gegeneinander
 *     auszuspielen: das Anheften eines Themas würde vergessen, dass es
 *     veröffentlicht war, und das Ausblenden würde vergessen, dass es
 *     geschlossen war.
 *  2. JEDE bestehende Abfrage filtert `Query.equal('status', 'published')` —
 *     die Topic-Liste, der Feed, die Zählungen, die About-Seite. Ein Thema auf
 *     'closed' zu setzen würde es aus allen still verschwinden lassen. Der
 *     „kleine" Modell-Fehler wäre damit ein Datenverlust im Sichtbaren.
 *  3. Die Suche (Stück 2) fragt nach KOMBINATIONEN („offen UND ungelöst").
 *     Mit eigenen Spalten ist das ein zweiter `Query.equal`, mit Status-Werten
 *     wäre es eine Fallunterscheidung über eine Wert-Liste.
 *
 * Verworfene Zwischenlösung: EINE Spalte `flags` als JSON-Array. Spart zwei
 * Spalten und kostet die Filterbarkeit — Appwrite kann in einem JSON-String
 * nicht suchen, und genau das Suchen ist der Zweck.
 *
 * ── WARUM `solved` EIN BOOLEAN IST UND KEIN ZEITSTEMPEL ────────────────────
 * Ein `solvedAt` wüsste zusätzlich WANN. Nur: es gibt heute keinen Leser für
 * die Uhrzeit — die Suche fragt „gelöst ja/nein", die Tabelle zeigt ein
 * Abzeichen. Eine Spalte ohne Leser ist Ballast, den man später doppelt
 * pflegt; ein `solvedAt` daneben zu stellen ist jederzeit wieder additiv
 * möglich (dieselbe Abwägung wie bei `lastActivityAt`, das umgekehrt einen
 * Leser HATTE und deshalb sofort kam).
 *
 * REIHENFOLGE: MIGRATION ZUERST, DEPLOY DANACH — und das ist kein Ratschlag.
 * Die drei Felder sind im Typ `CommunityPost` PFLICHT (dieselbe Entscheidung
 * wie bei `categoryId` in posts-008: `tenantDb().create<CommunityPost>`
 * verlangt alle Nicht-`Models.Row`-Felder vollständig, damit keine künftige
 * Anlegestelle sie stillschweigend weglässt). Ab dem Deploy stempelt
 * `POST /api/posts` sie also bei JEDEM neuen Beitrag mit — läuft der Code vor
 * der Migration, schlägt das Anlegen eines Beitrags fehl.
 *
 * KEIN BACKFILL NÖTIG: alle drei tragen den Default `false`, und das ist für
 * Bestand die richtige Aussage — kein Altbeitrag war je angeheftet,
 * geschlossen oder gelöst. Anders als bei posts-009 (wo `null` die Sortierung
 * zerstört hätte) gibt es hier nichts nachzutragen.
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
const COLUMNS = ['pinned', 'closed', 'solved'] as const

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

console.log(`Migration posts-011 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

for (const key of COLUMNS) {
  // `required: false` mit `xdefault: false` — dieselbe Form wie jede andere
  // additive Boolean-Spalte im Repo (media_items.featured, tenants.openRegistration).
  // Eine PFLICHT-Spalte ohne Default würde jede Bestandszeile ungültig machen.
  await step(`Column ${TABLE}.${key}`, () => tablesDB.createBooleanColumn({
    databaseId, tableId: TABLE, key, required: false, xdefault: false,
  }))
  await waitForColumn(TABLE, key)
}

/**
 * EIN Index, nicht drei.
 *
 * Er trägt die einzige Abfrage, die durch die Zustände WIRKLICH neu wird: die
 * Standard-Liste sortiert seit Stufe 3 „angeheftet zuerst, dann Aktivität".
 * Zuschnitt exakt wie `idx_community_activity` aus posts-009, nur mit `pinned`
 * davor — damit deckt er beides ab (MariaDB kann ein Präfix des Index nutzen),
 * und der alte bleibt trotzdem stehen, weil er die Kategorie-Zählungen trägt.
 *
 * Für `closed` und `solved` gibt es BEWUSST keinen eigenen Index: sie kommen
 * nur als zusätzlicher Gleichheits-Filter in einer Abfrage vor, die über
 * communityId + categoryId ohnehin schon stark eingegrenzt ist. Ein Index je
 * Filter-Kästchen wäre die Sorte Vorsorge, die jede Schreiboperation teurer
 * macht, ohne je gemessen worden zu sein.
 */
await indexStep(`Index ${TABLE}.idx_community_pinned`, {
  tableId: TABLE, key: 'idx_community_pinned', type: TablesDBIndexType.Key,
  columns: ['communityId', 'categoryId', 'pinned', 'lastActivityAt'],
})

console.log('✔ Migration posts-011 fertig')
