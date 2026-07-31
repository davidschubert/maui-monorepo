/**
 * Migration control-017: Einladungs-Anfragen (Early-Access-Warteschlange).
 *
 * Der Ablauf, den David beschrieben hat: jemand fragt Early Access an → die
 * Anfrage landet in einer Warteschlange (plus Mail + Benachrichtigung an den
 * Betreiber) → der Betreiber weist per Klick einen Code aus dem Vorrat zu →
 * die Mail geht automatisch raus → später sieht er, ob eingelöst wurde, und
 * kann erinnern.
 *
 * Zwei Teile:
 *
 *  1. `invite_requests` — die Warteschlange. `email` ist UNIQUE: fragt jemand
 *     zweimal, ist es dieselbe Anfrage (sonst füllt sich die Liste mit
 *     Dubletten und der Betreiber weiß nicht, was er schon angesehen hat).
 *  2. `invite_codes` bekommt die Verbindung zur Anfrage UND zur Einlösung:
 *     - `boundEmail` — der Code gilt nur für DIESE Adresse. Damit ist ein
 *       weitergeleiteter Code wertlos, und „einmalig" hält auch ohne atomaren
 *       Zähler (die dokumentierte Restunschärfe aus O2 verschwindet für den
 *       Anfrage-Pfad). '' = Inhaberpapier wie bisher (Betreiber-Weg).
 *     - `redeemedAt`/`redeemedSiteId` — die TATSACHE der Einlösung, nicht eine
 *       Vermutung: das Dashboard zeigt „eingelöst am … → host", nicht ein Häkchen.
 *
 * Rein ADDITIV. Idempotent (409 → skip). Aufruf über den Runner:
 *   pnpm migrate --app control --layer control
 */
import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite'

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
async function waitForColumn(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    const column = columns.find(c => (c as { key?: string }).key === key)
    if (column && (column as { status?: string }).status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Column ${tableId}.${key} wurde nicht 'available'`)
}

console.log(`Migration control-017 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// ── 1. invite_requests (die Warteschlange) ──────────────────────────────────
await step('Table invite_requests', () => tablesDB.createTable({
  databaseId, tableId: 'invite_requests', name: 'Invite Requests',
  permissions: [], // nur Server-Routen — enthält personenbezogene Daten
  rowSecurity: false,
}))
await step('Column invite_requests.email', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'invite_requests', key: 'email', size: 254, required: true,
}))
// Freitext „wofür willst du Pukalani nutzen?" — hilft beim Einordnen.
await step('Column invite_requests.note', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'invite_requests', key: 'note', size: 500, required: false, xdefault: '',
}))
await step('Column invite_requests.locale', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'invite_requests', key: 'locale', size: 5, required: false, xdefault: 'de',
}))
await step('Column invite_requests.status', () => tablesDB.createEnumColumn({
  databaseId, tableId: 'invite_requests', key: 'status',
  elements: ['new', 'assigned', 'redeemed', 'declined', 'deferred'],
  required: false, xdefault: 'new',
}))
await step('Column invite_requests.inviteCodeId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'invite_requests', key: 'inviteCodeId', size: 36, required: false, xdefault: '',
}))
await step('Column invite_requests.assignedAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'invite_requests', key: 'assignedAt', required: false,
}))
await step('Column invite_requests.redeemedAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'invite_requests', key: 'redeemedAt', required: false,
}))
// Was aus der Anfrage geworden ist — beantwortet die Folgefrage direkt.
await step('Column invite_requests.siteId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'invite_requests', key: 'siteId', size: 36, required: false, xdefault: '',
}))
await step('Column invite_requests.reminders', () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'invite_requests', key: 'reminders', required: false, xdefault: 0, min: 0, max: 100,
}))
await step('Column invite_requests.lastReminderAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'invite_requests', key: 'lastReminderAt', required: false,
}))
await waitForColumn('invite_requests', 'email')
await waitForColumn('invite_requests', 'status')

// Eine Adresse = EINE Anfrage. Wer zweimal fragt, aktualisiert seine eigene —
// sonst füllt sich die Warteschlange mit Dubletten.
await step('Unique-Index invite_requests.uq_email', () => tablesDB.createIndex({
  databaseId, tableId: 'invite_requests', key: 'uq_email', type: TablesDBIndexType.Unique,
  columns: ['email'],
}))
await step('Index invite_requests.idx_status', () => tablesDB.createIndex({
  databaseId, tableId: 'invite_requests', key: 'idx_status', type: TablesDBIndexType.Key,
  columns: ['status'],
}))

// ── 2. invite_codes: Bindung an Adresse + Einlöse-Tatsache ──────────────────
await step('Column invite_codes.boundEmail', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'invite_codes', key: 'boundEmail', size: 254, required: false, xdefault: '',
}))
await step('Column invite_codes.requestId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'invite_codes', key: 'requestId', size: 36, required: false, xdefault: '',
}))
await step('Column invite_codes.assignedAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'invite_codes', key: 'assignedAt', required: false,
}))
await step('Column invite_codes.redeemedAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'invite_codes', key: 'redeemedAt', required: false,
}))
await step('Column invite_codes.redeemedSiteId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'invite_codes', key: 'redeemedSiteId', size: 36, required: false, xdefault: '',
}))
await waitForColumn('invite_codes', 'boundEmail')

// „Nächster freier Code aus dem Vorrat" = aktiv, an niemanden gebunden.
await step('Index invite_codes.idx_stock', () => tablesDB.createIndex({
  databaseId, tableId: 'invite_codes', key: 'idx_stock', type: TablesDBIndexType.Key,
  columns: ['status', 'boundEmail'],
}))

console.log('✔ Migration control-017 fertig')
