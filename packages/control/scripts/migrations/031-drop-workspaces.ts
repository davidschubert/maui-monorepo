/**
 * Migration control-031: A6 Schritt 5, VERENGEN — `workspaces` fällt.
 *
 * Bis A6 war der Workspace der Rechnungs-Behälter: Stripe-Customer, Abo und
 * Plan hingen an ihm, die Community daneben. Seit Davids Entscheidung vom
 * 2026-07-30 ist die COMMUNITY das zahlende Objekt (`communities.plan/
 * billingStatus/stripeCustomerId/stripeSubscriptionId`, control-028), und der
 * Behälter hat keine Aufgabe mehr. Der Code kennt ihn seit dem Deploy von
 * A6 Schritt 5 nicht mehr — Routen, Seiten, Nav, Fulfillment-Zweig, GDPR-
 * Contributor und der Trial-Sweep-Zweig sind gelöscht.
 *
 * LÄUFT NACH DEM CODE-DEPLOY. Andersherum bricht das Anlegen einer Community:
 * `createRow<TenantRow>` verlangt ALLE Spalten explizit (CLAUDE.md), und der
 * alte Code schreibt `workspaceId` noch mit.
 *
 * DIE BREMSE VOR DEM LÖSCHEN — ein Abo bei Stripe überlebt jedes Löschen bei
 * uns. Trägt auch nur EIN workspaces-Row eine lebende Subscription, bricht der
 * Lauf ab und sagt, was zu tun ist: erst bei Stripe kündigen. TESTMODUS ZÄHLT
 * MIT (kein `livemode`-Filter): eine Zeile, die wie ein lebendes Abo aussieht,
 * wird auch so behandelt — fail-loud ist billiger als eine Abbuchung, deren
 * Gegenstück wir gelöscht haben.
 *
 * Was fällt:
 *   - Tables `workspaces`, `workspace_members`, `workspace_invites`
 *   - Column `communities.workspaceId` (+ Indizes darauf, falls vorhanden)
 *
 * Was bewusst STEHEN BLEIBT:
 *   - `websites.workspaceId` samt `idx_workspace` — das Studio-Register ist
 *     ein eigenes Thema (die geparkte Lizenz-Mechanik lebt dort); die Spalte
 *     ist tot, aber ihr Abräumen gehört in einen eigenen Schritt mit eigener
 *     Begründung, nicht als Beifang hier hinein.
 *   - Tables `entitlements`/`product_catalog` — die Lizenz-Mechanik der
 *     Studio-Seite ist GEPARKT (Davids A6-Entscheidung 3), nicht gelöscht.
 *
 * IDEMPOTENT über 404. Auf einem frischen Bootstrap legen control-005..009 die
 * Objekte weiter an (Protokoll) und diese räumt sie ab — jede Instanz erreicht
 * denselben Endzustand.
 *
 *   pnpm migrate --app control --layer control
 */
import { Client, Query, TablesDB, type Models } from 'node-appwrite'

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

console.log(`Migration control-031 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

// ── Bremse: lebt bei Stripe noch ein Abo an einem Workspace? ─────────────────
// Stati, in denen ein Abo den Plan noch trägt (Dunning eingeschlossen) — genau
// die Liste aus dem Fulfillment-Plugin. 'canceled' ist erledigt und blockiert
// nicht.
const LIVE_WORKSPACE_STATUSES = new Set(['active', 'past_due'])

interface WorkspaceLike extends Models.Row {
  name?: string
  ownerEmail?: string
  status?: string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
}

const live: string[] = []
let scanned = 0
for (let offset = 0; ; offset += 100) {
  const page = await tablesDB.listRows<WorkspaceLike>({
    databaseId: db, tableId: 'workspaces', queries: [Query.limit(100), Query.offset(offset)],
  }).catch((error) => {
    if (hasCode(error, 404)) return null
    throw error
  })
  if (!page) {
    console.log('↷ Table workspaces schon weg — Abo-Prüfung entfällt')
    break
  }
  scanned += page.rows.length
  for (const row of page.rows) {
    // `?? ''` fängt auch NULL-Werte aus der Zeit vor control-009.
    const subscription = row.stripeSubscriptionId ?? ''
    if (subscription !== '' && LIVE_WORKSPACE_STATUSES.has(row.status ?? '')) {
      live.push(`${row.$id} (${row.name ?? '?'}, ${row.ownerEmail ?? '?'}) → ${subscription} [status ${row.status}]`)
    }
  }
  if (page.rows.length < 100) break
}

if (live.length > 0) {
  console.error('\n✖ ABBRUCH — es wird NICHTS gelöscht.\n')
  console.error(`${live.length} Workspace-Row(s) tragen eine lebende Stripe-Subscription:`)
  for (const entry of live) console.error(`   • ${entry}`)
  console.error('\nDiese Abos ÜBERLEBEN das Löschen der Tabelle: Stripe bucht weiter ab,')
  console.error('und es gäbe dann keine Zeile mehr, die das Abo einem Kunden zuordnet.')
  console.error('Erst bei Stripe kündigen (oder auf die Community umziehen), dann erneut laufen lassen.')
  console.error('Testmodus zählt bewusst mit — eine Test-Sub sieht hier aus wie eine echte.')
  process.exit(1)
}
console.log(`✔ Abo-Prüfung: ${scanned} Workspace-Row(s) geprüft, keine lebende Stripe-Subscription`)

// ── Indizes auf communities.workspaceId zuerst ──────────────────────────────
// Ein Index auf der Spalte verhindert ihr Löschen. Nicht raten, welche es gibt:
// nachsehen. (Lokal am 2026-07-31 gemessen: KEINER — communities trägt nur
// uq_host/idx_status/idx_trial/idx_stripe_customer. Auf einer Instanz, die aus
// control-006 hervorging, kann `idx_workspace` aber mitkopiert worden sein.)
// Query.limit(200): die Default-Seite ist 25 — ein übersehener Index würde das
// Löschen der Spalte scheitern lassen, und zwar erst ganz am Ende.
const indexes = await tablesDB.listIndexes({
  databaseId: db, tableId: 'communities', queries: [Query.limit(200)],
}).catch((error) => {
  if (hasCode(error, 404)) return null
  throw error
})
for (const index of indexes?.indexes ?? []) {
  if (!index.columns.includes('workspaceId')) continue
  // destruktiv-ok: der Index zeigt auf eine Spalte, die in derselben Migration
  // fällt — ohne ihn kann sie gar nicht gelöscht werden.
  await step(`Index communities.${index.key} löschen`, () => tablesDB.deleteIndex({
    databaseId: db, tableId: 'communities', key: index.key,
  }))
}

// ── Die Spalte ──────────────────────────────────────────────────────────────
// destruktiv-ok: `communities.workspaceId` ist seit dem Deploy von A6 Schritt 5
// tot — kein Code liest oder schreibt sie (die beiden Anlegestellen setzen sie
// nur noch auf '', Kommentar „tote Spalte" an beiden). Ihr Inhalt zeigte auf
// `workspaces`, und die Tabelle fällt drei Zeilen weiter.
await step('Column communities.workspaceId löschen', () => tablesDB.deleteColumn({
  databaseId: db, tableId: 'communities', key: 'workspaceId',
}))

// ── Die Tabellen ────────────────────────────────────────────────────────────
// destruktiv-ok: kein Code liest oder schreibt sie mehr (Routen, Seiten, Nav,
// Fulfillment-Zweig, GDPR-Contributor und Trial-Sweep-Zweig sind mit A6
// Schritt 5 gelöscht; grep-Beweis im selben Commit), es gibt keinen
// Produktivbetrieb und keine zahlenden Kunden, und die Bremse oben hat
// bewiesen, dass kein Abo daran hängt. Ein Nachfolger wird BEWUSST nicht
// gebraucht: die Rechnungs-Daten leben seit control-028 in `communities`, die
// Mitgliedschaften seit control-015/019 in `community_members` — es ist keine
// Umbenennung, sondern ein Wegfall.
for (const tableId of ['workspace_invites', 'workspace_members', 'workspaces']) {
  await step(`Table ${tableId} löschen`, () => tablesDB.deleteTable({ databaseId: db, tableId }))
}

console.log('✔ Migration control-031 fertig — die Community ist das zahlende Objekt, der Workspace ist Geschichte.')
