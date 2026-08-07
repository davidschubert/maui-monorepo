/**
 * Migration control-035: EIGENE DOMAIN JE COMMUNITY.
 *
 * Davids Entscheidungen vom 2026-08-07 (DECISION-LOG): ab Plan **Pro**,
 * **301** von der Subdomain auf die eigene Domain (die Subdomain bleibt
 * Rückfall), **Selbstbedienung** (Owner trägt ein, das System prüft DNS und
 * stößt Zertifikat + Appwrite-Platform an), **www + Apex** automatisch beide
 * aktiv — die eingetragene Form ist die kanonische.
 *
 * SECHS ADDITIVE SPALTEN an `communities` + EIN Index. Nichts Zerstörerisches,
 * idempotent (409 → skip).
 *
 * ── MUSS VOR DEM CODE-DEPLOY LAUFEN ────────────────────────────────────────
 * `createRow<TenantRow>` nennt ALLE Spalten explizit (CLAUDE.md) — sobald der
 * Code die sechs Felder kennt, bricht das Anlegen einer Community gegen ein
 * Schema ohne sie. Betroffen sind BEIDE Anlegestellen
 * (`server/api/control/tenants/index.post.ts` + `server/utils/onboardingProvision.ts`).
 *
 * ── WARUM DER INDEX KEIN UNIQUE IST ────────────────────────────────────────
 * Naheliegend wäre `uq_custom_domain` — die Domain darf schließlich nur EINER
 * Community gehören. Es geht aber nicht: die Spalte ist optional mit dem
 * Default `''`, und in MariaDB kollidieren LEERE STRINGS in einem Unique-Index
 * (anders als NULL). Nach der ersten Zeile ohne eigene Domain wäre jede weitere
 * Community unanlegbar — die Migration liefe durch und das Onboarding stünde.
 *
 * Die Eindeutigkeit setzt deshalb der CODE durch, und zwar über BEIDE Formen
 * (`customDomainForms()`): `POST /api/control/community/domain/set` sucht die
 * Domain und ihre www-/Apex-Geschwister und weist mit 409 ab, wenn eine ANDERE
 * Community sie schon trägt. Das ist ohnehin die schärfere Prüfung — ein
 * Unique-Index auf einer Spalte hätte das Paar nie gesehen.
 *
 * ── WARUM `customDomainStatus` KEIN ENUM IST ───────────────────────────────
 * Dieselbe Begründung wie bei `suspension` (control-034):
 * `resolveCustomDomainStatus()` liest ohnehin fail-closed, und eine
 * Enum-Spalte müsste für jede spätere Stufe migriert werden.
 *
 *   pnpm migrate --app control --layer control
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

const db = databaseId
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { indexStep } = createIndexSteps(tablesDB, db)

const COMMUNITIES = 'communities'

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

console.log(`Migration control-035 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

const cols = await existingColumnKeys(COMMUNITIES)

// Die EINGETRAGENE Form ist die kanonische (Davids Entscheidung 4). Die
// Geschwister-Form (www ↔ Apex) wird gerechnet, nicht gespeichert — zwei
// Spalten wären zwei Gelegenheiten, sie auseinanderlaufen zu lassen.
// 253 = die DNS-Obergrenze eines Hostnamens, wie bei `host`.
await columnStep(`Column ${COMMUNITIES}.customDomain`, 'customDomain', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'customDomain', size: 253, required: false, xdefault: '',
}))
// '' = keine eigene Domain. Sonst pending_dns | pending_cert |
// pending_platform | active | error (shared/customDomain.ts).
await columnStep(`Column ${COMMUNITIES}.customDomainStatus`, 'customDomainStatus', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'customDomainStatus', size: 20, required: false, xdefault: '',
}))
// Der Eigentums-Nachweis: 32 Hex-Zeichen, an GENAU DIESE Community gebunden.
// Er ist der Grund, warum eine fremde Community eine verwaiste Domain nicht
// übernehmen kann, die zufällig noch auf unsere IP zeigt.
await columnStep(`Column ${COMMUNITIES}.customDomainToken`, 'customDomainToken', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'customDomainToken', size: 32, required: false, xdefault: '',
}))
// Der Text, den DER OWNER liest — nicht eine interne Notiz daneben (dieselbe
// Entscheidung wie bei `suspensionReason`). Ein Fehler, den der Betroffene nie
// sieht, macht aus „hängt" ein „kaputt".
await columnStep(`Column ${COMMUNITIES}.customDomainError`, 'customDomainError', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'customDomainError', size: 500, required: false, xdefault: '',
}))
// Wann der Eigentums-Nachweis zuletzt gehalten hat. Eigene Spalte statt
// „$updatedAt": jeder Prüf-Klick schreibt die Row, das Datum darf davon nicht
// wandern.
await columnStep(`Column ${COMMUNITIES}.customDomainVerifiedAt`, 'customDomainVerifiedAt', cols, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'customDomainVerifiedAt', required: false,
}))
await columnStep(`Column ${COMMUNITIES}.customDomainActivatedAt`, 'customDomainActivatedAt', cols, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'customDomainActivatedAt', required: false,
}))

await waitForColumns(COMMUNITIES, [
  'customDomain',
  'customDomainStatus',
  'customDomainToken',
  'customDomainError',
  'customDomainVerifiedAt',
  'customDomainActivatedAt',
])

// DER INDEX, AN DEM DIE HOST-AUFLÖSUNG HÄNGT. Der Tenant-Resolver fragt bei
// JEDEM Request eines unbekannten Hosts `Query.equal('customDomain', [host,
// geschwister])` — ohne Index antwortet Appwrite mit „index not found", und
// dann wäre JEDE Kundendomain tot (nicht langsam: tot).
await indexStep(`Index ${COMMUNITIES}.idx_custom_domain`, {
  tableId: COMMUNITIES, key: 'idx_custom_domain',
  type: TablesDBIndexType.Key, columns: ['customDomain'],
})

console.log('✔ Migration control-035 fertig — 6 Spalten an communities, Index idx_custom_domain.')
