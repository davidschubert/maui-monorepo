/**
 * Migration control-034: M13 — der Sperr-/Missbrauchspfad.
 *
 * Davids Entscheidungen vom 2026-08-02 (drei Auslöser, zwei Stufen):
 *   Auslöser 1 — der Betreiber sperrt von Hand (Grund wird protokolliert).
 *   Auslöser 2 — Zahlungsverzug: der Stripe-Webhook stempelt `pastDueSince`,
 *                ein stündlicher Sweep sperrt nach 14 Tagen (NIE der Webhook
 *                selbst: der muss bei transienten Fehlern werfen, nicht sperren).
 *   Auslöser 3 — geprüfte Missbrauchsmeldung aus dem neuen Formular.
 * Stufen: `billing` = Community nur-lesend · `abuse` = Host komplett offline.
 *
 * ZWEI TEILE:
 *   A) vier ADDITIVE Spalten an `communities` + ein Index auf `billingStatus`
 *      (der Sweep fragt danach — Appwrite verlangt für `Query.equal` einen).
 *   B) die Tabelle `abuse_reports` — die Warteschlange des Meldeformulars.
 *
 * MUSS VOR DEM CODE-DEPLOY LAUFEN: `createRow<TenantRow>` verlangt ALLE Spalten
 * explizit (CLAUDE.md) — sobald der Code die vier Felder kennt, bricht das
 * Anlegen einer Community gegen ein Schema ohne sie. Betroffen sind BEIDE
 * Anlegestellen (`tenants/index.post.ts` + `onboardingProvision.ts`).
 *
 * WARUM EINE EIGENE ACHSE NEBEN `status`: `status: 'disabled'` 404et den Host
 * zwar auch, ist aber der LÖSCHWEG (C16) und lässt die Community aus der
 * Kundenübersicht verschwinden. Eine gesperrte Community muss dort BLEIBEN,
 * sonst kann der Owner weder bezahlen noch erfahren, warum seine Adresse tot
 * ist. Und `status` trägt weder Grund noch Zeitpunkt. Die Herleitung steht
 * vollständig in `packages/core/shared/communitySuspension.ts`.
 *
 * ADDITIV, IDEMPOTENT (409 → skip), nichts Zerstörerisches.
 *
 *   pnpm migrate --app control --layer control
 */
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { indexStep } from '../../../../scripts/migrations-lib/indexRetry.mts'

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

const COMMUNITIES = 'communities'
const REPORTS = 'abuse_reports'

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

/** Vorhandene Spalten EINER Table — immer mit explizitem Limit (Default 25). */
async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId, queries: [Query.limit(200)] })
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

async function waitForColumns(tableId: string, keys: string[]) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId, queries: [Query.limit(200)] })
    const wanted = columns.filter(column => keys.includes(column.key))
    if (wanted.length === keys.length && wanted.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns ${keys.join(', ')} von "${tableId}" wurden nicht verfügbar`)
}

async function waitForAllColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId, queries: [Query.limit(200)] })
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration control-034 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

// ── A) communities: die Sperr-Achse ────────────────────────────────────────

const communityCols = await existingColumnKeys(COMMUNITIES)

// '' = nicht gesperrt (Normalfall). Sonst 'billing' | 'abuse'. Bewusst KEIN
// Enum: `resolveCommunitySuspension()` liest ohnehin fail-open, und eine
// Enum-Spalte müsste für jede spätere Stufe migriert werden.
await columnStep(`Column ${COMMUNITIES}.suspension`, 'suspension', communityCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'suspension', size: 12, required: false, xdefault: '',
}))
// Der Grund IST der Text, den der Owner zu sehen bekommt — nicht eine interne
// Notiz daneben. Ein Grund, den der Betroffene nie liest, hilft niemandem, und
// zwei Felder wären zwei Gelegenheiten, das falsche zu zeigen.
await columnStep(`Column ${COMMUNITIES}.suspensionReason`, 'suspensionReason', communityCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'suspensionReason', size: 500, required: false, xdefault: '',
}))
await columnStep(`Column ${COMMUNITIES}.suspendedAt`, 'suspendedAt', communityCols, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'suspendedAt', required: false,
}))
// SEIT WANN läuft die Frist? Eigene Spalte statt „$updatedAt minus irgendwas":
// der Webhook schreibt bei jedem Dunning-Versuch, das Datum darf sich dabei
// NICHT verschieben — sonst begänne die 14-Tage-Frist bei jeder fehlgeschlagenen
// Abbuchung von vorn und liefe nie ab.
await columnStep(`Column ${COMMUNITIES}.pastDueSince`, 'pastDueSince', communityCols, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'pastDueSince', required: false,
}))

await waitForColumns(COMMUNITIES, ['suspension', 'suspensionReason', 'suspendedAt', 'pastDueSince'])

// Der Sweep sucht `billingStatus == 'past_due'` — ohne Index antwortet Appwrite
// mit „index not found", und der Sweep wäre still wirkungslos.
await indexStep(`Index ${COMMUNITIES}.idx_billing_status`, () => tablesDB.createIndex({
  databaseId: db, tableId: COMMUNITIES, key: 'idx_billing_status',
  type: TablesDBIndexType.Key, columns: ['billingStatus'],
}))
// Zweite Hälfte desselben Sweeps: „welche Communities sind gerade gesperrt?"
// (Sperre wieder aufheben, wenn kein Verzug mehr besteht) — und die
// Betreiber-Übersicht filtert danach.
await indexStep(`Index ${COMMUNITIES}.idx_suspension`, () => tablesDB.createIndex({
  databaseId: db, tableId: COMMUNITIES, key: 'idx_suspension',
  type: TablesDBIndexType.Key, columns: ['suspension'],
}))

// ── B) abuse_reports: die Warteschlange des Meldeformulars ─────────────────

// KEINE Row-Permissions, `permissions: []` — wie `invite_requests` und
// `customer_feedback`: gelesen und geschrieben wird ausschließlich
// server-seitig durch das Control Plane (Service-Naht mit Secret). Eine Meldung
// enthält den Vorwurf gegen eine benannte Community und (freiwillig) die
// Adresse des Melders; nichts davon darf ein Browser in diesem Projekt sehen.
await step(`Table ${REPORTS}`, () => tablesDB.createTable({
  databaseId: db, tableId: REPORTS, name: 'Abuse Reports', permissions: [], rowSecurity: false,
}))
const reportCols = await existingColumnKeys(REPORTS)

// Der gemeldete Host, so wie der Melder ihn eingetippt hat. Führend, weil eine
// Meldung auch dann ankommen muss, wenn der Host zu keiner Community (mehr)
// gehört — ein Tippfehler ist kein Grund, jemanden abzuweisen.
await columnStep(`Column ${REPORTS}.host`, 'host', reportCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: REPORTS, key: 'host', size: 253, required: true,
}))
// Aufgelöst beim Eingang (falls der Host bekannt ist) — der Betreiber soll in
// der Warteschlange mit EINEM Klick sperren können, ohne selbst zu suchen.
await columnStep(`Column ${REPORTS}.communityId`, 'communityId', reportCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: REPORTS, key: 'communityId', size: 36, required: false, xdefault: '',
}))
await columnStep(`Column ${REPORTS}.communityName`, 'communityName', reportCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: REPORTS, key: 'communityName', size: 120, required: false, xdefault: '',
}))
await columnStep(`Column ${REPORTS}.category`, 'category', reportCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: REPORTS, key: 'category', size: 24, required: true,
}))
await columnStep(`Column ${REPORTS}.message`, 'message', reportCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: REPORTS, key: 'message', size: 2000, required: true,
}))
// Optionaler Tiefen-Link auf den beanstandeten Inhalt.
await columnStep(`Column ${REPORTS}.url`, 'url', reportCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: REPORTS, key: 'url', size: 500, required: false, xdefault: '',
}))
// FREIWILLIG. Ohne Adresse heißt wirklich anonym — es gibt dann keine
// Rückfrage und keine Nachverfolgung (dieselbe Entscheidung wie bei
// customer_feedback, control-032).
await columnStep(`Column ${REPORTS}.reporterEmail`, 'reporterEmail', reportCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: REPORTS, key: 'reporterEmail', size: 255, required: false, xdefault: '',
}))
// 'open' | 'suspended' | 'dismissed' — die Warteschlange kennt genau drei
// Zustände: liegt an, hat zur Sperre geführt, war nichts dran.
await columnStep(`Column ${REPORTS}.status`, 'status', reportCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: REPORTS, key: 'status', size: 12, required: true,
}))
await columnStep(`Column ${REPORTS}.handledBy`, 'handledBy', reportCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: REPORTS, key: 'handledBy', size: 36, required: false, xdefault: '',
}))
await columnStep(`Column ${REPORTS}.handledAt`, 'handledAt', reportCols, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: REPORTS, key: 'handledAt', required: false,
}))
// Die INTERNE Notiz des Betreibers zur Entscheidung — im Gegensatz zu
// `communities.suspensionReason` sieht der Owner sie nie.
await columnStep(`Column ${REPORTS}.note`, 'note', reportCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: REPORTS, key: 'note', size: 1000, required: false, xdefault: '',
}))

await waitForAllColumns(REPORTS)

// Die Warteschlange filtert auf 'open'.
await indexStep(`Index ${REPORTS}.idx_status`, () => tablesDB.createIndex({
  databaseId: db, tableId: REPORTS, key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'],
}))
// „Was liegt gegen DIESE Community vor?" — beim Sperren und beim Aufräumen.
await indexStep(`Index ${REPORTS}.idx_community`, () => tablesDB.createIndex({
  databaseId: db, tableId: REPORTS, key: 'idx_community', type: TablesDBIndexType.Key, columns: ['communityId'],
}))
// BEWUSST KEIN Unique-Index: mehrere Menschen dürfen dieselbe Community melden,
// und die ZAHL der Meldungen ist selbst ein Signal. Gegen Flut hilft das
// Rate-Limit, nicht das Schema.
await indexStep(`Index ${REPORTS}.idx_host`, () => tablesDB.createIndex({
  databaseId: db, tableId: REPORTS, key: 'idx_host', type: TablesDBIndexType.Key, columns: ['host'],
}))

console.log('✔ Migration control-034 fertig — 4 Spalten an communities, Tabelle abuse_reports.')
