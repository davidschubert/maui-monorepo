/**
 * Migration events-011: der Schwärzungs-Marker (F46, 2026-08-03).
 *
 * AUSSCHLIESSLICH ADDITIV — EINE Spalte, keine Tabelle, kein Index:
 * - events.redactedAt (datetime, optional) — gesetzt heißt „Titel und
 *   Beschreibung hat die Moderation entfernt", null heißt „unangetastet".
 *
 * WARUM ÜBERHAUPT EINE SPALTE und nicht einfach der leere Text: „leer" kann die
 * Oberfläche nicht deuten. Sie wüsste nicht, ob nie etwas dastand oder ob jemand
 * es entfernt hat, und zeigte im Zweifel eine tote Fläche. Der Marker trennt
 * beides. Der HINWEISTEXT selbst steht NICHT in der Zeile, sondern in den
 * i18n-Dateien — die Instanz ist zweisprachig, ein deutscher Satz in der
 * Datenbank wäre für die englische Hälfte der Leser falsch und später nicht mehr
 * von echtem Inhalt zu unterscheiden.
 *
 * KEIN INDEX, und das ist eine Entscheidung: über `redactedAt` wird nie
 * gefiltert oder sortiert. Der Wert wird ausschließlich gelesen, nachdem die
 * Zeile ohnehin geladen ist (Detail, Moderations-Queue). Ein Index kostete hier
 * Schreiblast für nichts. Käme je eine Abfrage „alle geschwärzten Termine"
 * dazu, gehörte er über `createIndexSteps` aus
 * `scripts/migrations-lib/indexRetry.mts` angelegt — NIE über ein rohes
 * `tablesDB.createIndex` (ESLint verbietet es genau deshalb).
 *
 * KEIN `redactedBy`: die events-Zeile ist öffentlich lesbar (read(any) bzw.
 * read(label:<communityId>)). Die Id des Moderators dort abzulegen hieße, per
 * Roh-REST bekanntzugeben, wer eine Community moderiert. Begründung im Kopf von
 * `server/api/events/[id]/redact.post.ts`.
 *
 * Idempotent: die Spalte wird nur angelegt, wenn sie fehlt (`existingColumnKeys`
 * statt 409-Fang — Appwrite macht bei der events-Tabelle den Row-Size-Check VOR
 * dem Duplikat-Check und wirft dann 400 statt 409, s. events-001).
 *
 *   pnpm migrate --app <app> --layer events
 *
 * ⚠️ REIHENFOLGE IN PROD: ERST migrieren, DANN den Code deployen.
 * Läuft es andersherum, steht die Schwärzen-Aktion in der Queue, während die
 * Spalte fehlt: Appwrite lehnt unbekannte Felder ab, der PATCH stirbt mit
 * `400 row_invalid_structure` — und zwar NACHDEM der Moderator geklickt hat und
 * BEVOR irgendetwas passiert ist. Kein Datenverlust, aber eine Aktion, die
 * ohne erkennbaren Grund fehlschlägt (derselbe Fehler, an dem der Ticket-Kauf
 * bei der E8-3-Umbenennung endlos wiederholte). Die Migration VORHER ist
 * gefahrlos: eine optionale Spalte, die niemand liest, tut nichts.
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
/**
 * Auf 'available' warten, bevor die Migration „fertig" meldet — sonst schreibt
 * der erste Schwärzungs-Versuch in eine Spalte, die es noch nicht ganz gibt.
 * Ein Index folgt hier NICHT, der Cache-Anstoß aus indexRetry.mts ist also
 * nicht nötig (die physische Spalte existiert vor ihrem Status).
 */
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration events-011 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const eventCols = await existingColumnKeys('events')
if (eventCols.size === 0) {
  console.log('↷ Table events fehlt — events-001 zuerst ausführen. Nichts zu tun.')
  process.exit(0)
}

await columnStep('Column events.redactedAt', 'redactedAt', eventCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'events', key: 'redactedAt', required: false,
}))

await waitForColumns('events')

console.log('✔ Migration events-011 fertig — abgesagte Termine lassen sich schwärzen.')
