/**
 * Migration events-010: Entwurfs-Titelbilder ganz zumachen (F28, 2026-08-02).
 *
 * events-009 hat die Datei-Rechte an die Row gebunden — MIT EINER AUSNAHME:
 * ein Cover, dessen Row kein Leserecht trägt (Entwurf), bekam ersatzweise das
 * MITGLIEDER-Publikum der Community. Der Grund war die Vorschau im Dashboard,
 * die der Browser damals direkt aus dem Bucket holte; „niemand" hätte dort ein
 * kaputtes Bild bedeutet. Die Folge: jedes Mitglied konnte das Titelbild eines
 * unveröffentlichten Termins per Roh-URL abrufen — die Datei war offener als
 * ihre Zeile.
 *
 * Die Vorschau läuft jetzt server-seitig (`GET /api/events/:id/cover`, hinter
 * `events.manage` und der Datentür), also fällt die Ausnahme weg. Diese
 * Migration zieht den BESTAND nach: jede Cover-Datei bekommt exakt die
 * READ-Einträge ihrer Row — auch wenn das keine sind.
 *
 * WARUM EINE ZWEITE MIGRATION statt einer Korrektur in events-009: 009 ist
 * gelaufen (auf `comments`; auf `pool` noch nicht, s. F36). Eine Datei
 * nachträglich umzuschreiben ändert nicht, was auf einer Instanz schon
 * passiert ist — der Runner kennt kein Register, die Idempotenz kommt vom
 * Ergebnis. Beide Läufe hintereinander ergeben denselben Endzustand: 009 setzt
 * Entwürfe auf das Mitglieder-Publikum, 010 nimmt es ihnen wieder.
 *
 * DIE REGEL STEHT HIER EIN ZWEITES MAL, wie schon in 009 — und das ist eine
 * Entscheidung, keine Nachlässigkeit: der Runner startet jede Migration mit
 * `node --experimental-strip-types`, und der kennt nur Import-Pfade MIT
 * Endung (`../../shared/coverAudience.ts`). Genau die verbietet TypeScript in
 * einer typgeprüften Datei ohne `allowImportingTsExtensions`. Der Preis ist
 * hier klein: die Rechnung ist eine Filterzeile, und die Fassung, die zählt,
 * steht pur in `packages/events/shared/coverAudience.ts` (mitsamt Begründung)
 * und wird von der Laufzeit UND vom Live-Beweis von dort gelesen.
 *
 * Keine Columns, keine Indizes, kein Bucket-Umbau (das bleibt bei 009).
 * Idempotent: geschrieben wird nur, was abweicht.
 *
 *   pnpm migrate --app <app> --layer events
 *
 * ⚠️ REIHENFOLGE IN PROD: ERST den Code deployen, DANN migrieren. Läuft die
 * Migration vor dem Deploy, zeigt die Dashboard-Vorschau bis zum Deploy ein
 * kaputtes Bild (die Route gibt es noch nicht). Kein Datenrisiko, nur eine
 * hässliche Minute — andersherum bliebe das Leck offen.
 *
 * ⚠️ SCHLÜSSEL: braucht `buckets.read`/`files.read`/`files.write` auf der
 * Instanz — derselbe Blocker wie bei events-009 (F36, auf `pool` fehlt er).
 */
import { Client, Query, Storage, TablesDB, type Models } from 'node-appwrite'

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

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)
const storage = new Storage(client)

const TABLE_ID = 'events'
const BUCKET_ID = 'event-covers'
const PAGE = 100

interface EventCoverRow extends Models.Row {
  coverFileId: string | null
}

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

/**
 * Die Regel, wortgleich zu `packages/events/shared/coverAudience.ts`: die
 * READ-Einträge der Row, sonst nichts. Ein leeres Ergebnis (Entwurf) ist die
 * richtige Antwort und wird auch geschrieben.
 */
function coverReadPermissions(rowPermissions: readonly string[] | null | undefined): string[] {
  return (rowPermissions ?? []).filter(permission => permission.startsWith('read('))
}

/** Mengengleichheit — Permission-Arrays haben keine garantierte Reihenfolge. */
function samePermissions(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every(entry => set.has(entry))
}

console.log(`Migration events-010 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const bucket = await storage.getBucket({ bucketId: BUCKET_ID }).catch((error) => {
  if (hasCode(error, 404)) return null
  throw error
})
if (!bucket) {
  console.log(`↷ Bucket ${BUCKET_ID} fehlt — events-002/009 zuerst ausführen. Nichts zu tun.`)
  process.exit(0)
}

let failures = 0
let cursor: string | null = null
let rows = 0
let fixed = 0

for (;;) {
  const page: Models.RowList<EventCoverRow> = await tablesDB.listRows<EventCoverRow>({
    databaseId,
    tableId: TABLE_ID,
    queries: [Query.limit(PAGE), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
  })
  if (page.rows.length === 0) break

  for (const row of page.rows) {
    rows++
    if (!row.coverFileId) continue

    const wanted = coverReadPermissions(row.$permissions)
    const file = await storage.getFile({ bucketId: BUCKET_ID, fileId: row.coverFileId }).catch((error) => {
      if (hasCode(error, 404)) return null
      throw error
    })
    if (!file) {
      console.warn(`⚠ Datei ${row.coverFileId} zu Event ${row.$id} fehlt im Bucket — übersprungen`)
      continue
    }
    if (samePermissions(file.$permissions, wanted)) continue
    try {
      await storage.updateFile({ bucketId: BUCKET_ID, fileId: row.coverFileId, permissions: wanted })
      fixed++
    }
    catch (error) {
      failures++
      console.error(`✗ Datei ${row.coverFileId} (Event ${row.$id}) konnte nicht zugezogen werden:`, error)
    }
  }

  cursor = page.rows.at(-1)?.$id ?? null
  if (page.rows.length < PAGE) break
}

console.log(`✔ ${rows} Event-Zeile(n) gelesen, ${fixed} Datei(en) an ihre Zeile angeglichen`)

if (failures > 0) {
  console.error(`✗ Migration events-010 UNVOLLSTÄNDIG — ${failures} Datei(en) stehen noch offen. Erneut ausführen.`)
  process.exit(1)
}
console.log('✔ Migration events-010 fertig — ein Cover ist nie offener als sein Termin.')
