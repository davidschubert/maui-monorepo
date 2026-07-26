/**
 * Migration studio-016: Self-Service-Onboarding („Community in 60 Sekunden",
 * SAAS-ROADMAP #1). Zwei Teile:
 *
 *  1. `tenants` bekommt, was der Setup-Wizard entscheidet:
 *     - `theme`/`variant` — der gewählte Vibe als Built-in-Theme-Paar. Nötig,
 *       weil `app_config.themeSettings` EINE Row PRO PROJEKT ist: im Pool
 *       würde ein Wizard-Schreiber sonst ALLE Communities des Projekts
 *       umfärben. Das Theme gehört also an den Mandanten, nicht ins Projekt.
 *     - `audience` — Lese-Publikum (G0-Entscheidung 7: privat als Default,
 *       öffentlich opt-in). Speist H3-Naht 4 (`tenantRowPermissionsFor`).
 *     - `trialEndsAt` — echte Datetime-Spalte, damit der Downgrade-Sweep die
 *       fälligen Tenants per Range-Query findet statt alle Rows zu lesen.
 *     - `profile` — die Onboarding-Antworten als JSON (parseSiteProfile).
 *     - `inviteCodeId` — mit welchem Code die Community entstand (Abuse-Spur).
 *  2. `invite_codes` — das Early-Access-Tor. Nur der sha256-Hash wird
 *     gespeichert (wie bei den Workspace-Einladungen); der Klartext erscheint
 *     einmal im Control und danach nie wieder.
 *
 * Rein ADDITIV (keine Spalte wird umgebaut, keine Row angefasst) — damit auf
 * der befüllten Prod-Instanz gefahrlos fahrbar. Idempotent (409 → skip).
 * Aufruf über den Runner:
 *   pnpm migrate --app studio --layer studio
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

console.log(`Migration studio-016 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// ── 1. tenants: Vibe, Publikum, Testphase, Profil, Code-Spur ────────────────
await step('Column tenants.theme', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tenants', key: 'theme', size: 32, required: false, xdefault: '',
}))
await step('Column tenants.variant', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tenants', key: 'variant', size: 32, required: false, xdefault: '',
}))
// Enum statt Varchar: „privat" ist eine Sicherheitsgrenze — die Datenbank soll
// einen Tippfehler abweisen, nicht in einen unbekannten Zustand rutschen.
await step('Column tenants.audience', () => tablesDB.createEnumColumn({
  databaseId, tableId: 'tenants', key: 'audience',
  elements: ['members', 'public'], required: false, xdefault: 'members',
}))
await step('Column tenants.trialEndsAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'tenants', key: 'trialEndsAt', required: false,
}))
// 2000 Zeichen: reicht für alle Antworten inkl. 600-Zeichen-Beschreibung und
// bleibt weit unter dem utf8mb4-Zeilenbudget (~65 KB) der tenants-Row.
await step('Column tenants.profile', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tenants', key: 'profile', size: 2000, required: false, xdefault: '',
}))
await step('Column tenants.inviteCodeId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tenants', key: 'inviteCodeId', size: 36, required: false, xdefault: '',
}))
await waitForColumn('tenants', 'audience')
await waitForColumn('tenants', 'trialEndsAt')

// Der Downgrade-Sweep fragt „welche Testphasen sind fällig?" — ohne Index
// wäre das ein Full-Scan über alle Tenants.
await step('Index tenants.idx_trial', () => tablesDB.createIndex({
  databaseId, tableId: 'tenants', key: 'idx_trial', type: TablesDBIndexType.Key,
  columns: ['trialEndsAt'],
}))

// ── 1b. site_members: „welche Communities gehören DIESEM Nutzer?" ───────────
// Der Onboarding-Pfad muss das Konto-Kontingent prüfen (eine Community in der
// Testphase) — das ist eine Abfrage über den Runtime-User, nicht über die
// Site. idx_lookup (siteId, projectId, userId) trägt sie nicht.
await step('Index site_members.idx_owner', () => tablesDB.createIndex({
  databaseId, tableId: 'site_members', key: 'idx_owner', type: TablesDBIndexType.Key,
  columns: ['runtimeProjectId', 'runtimeUserId'],
}))

// ── 2. invite_codes (Early-Access-Tor) ──────────────────────────────────────
await step('Table invite_codes', () => tablesDB.createTable({
  databaseId, tableId: 'invite_codes', name: 'Invite Codes',
  permissions: [], // nur Server-Routen — nie clientseitig lesbar
  rowSecurity: false,
}))
await step('Column invite_codes.codeHash', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'invite_codes', key: 'codeHash', size: 64, required: true,
}))
await step('Column invite_codes.label', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'invite_codes', key: 'label', size: 120, required: false, xdefault: '',
}))
// 0 = unbegrenzt (gleiche Konvention wie die Quota-Limits).
await step('Column invite_codes.maxUses', () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'invite_codes', key: 'maxUses', required: false, xdefault: 1, min: 0, max: 100_000,
}))
await step('Column invite_codes.uses', () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'invite_codes', key: 'uses', required: false, xdefault: 0, min: 0, max: 100_000,
}))
await step('Column invite_codes.expiresAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'invite_codes', key: 'expiresAt', required: false,
}))
await step('Column invite_codes.status', () => tablesDB.createEnumColumn({
  databaseId, tableId: 'invite_codes', key: 'status',
  elements: ['active', 'revoked'], required: false, xdefault: 'active',
}))
await waitForColumn('invite_codes', 'codeHash')
await waitForColumn('invite_codes', 'status')

// Der Einlöse-Pfad sucht AUSSCHLIESSLICH über den Hash — Unique verhindert
// zwei Rows zum selben Code (und damit doppelte Kontingente).
await step('Unique-Index invite_codes.uq_code', () => tablesDB.createIndex({
  databaseId, tableId: 'invite_codes', key: 'uq_code', type: TablesDBIndexType.Unique,
  columns: ['codeHash'],
}))
await step('Index invite_codes.idx_status', () => tablesDB.createIndex({
  databaseId, tableId: 'invite_codes', key: 'idx_status', type: TablesDBIndexType.Key,
  columns: ['status'],
}))

console.log('✔ Migration studio-016 fertig')
