/**
 * Migration control-023: `site_members` → `community_members`,
 * `site_invites` → `community_invites`, und die Spalte `siteId` → `communityId`
 * in DREI Tabellen (den beiden neuen **und** `invite_requests`, die ihren Namen
 * behält).
 *
 * Zweite Etappe der Umbenennung auf das Vokabular der Oberfläche (OPEN-ITEMS E8,
 * Davids Entscheidung 2026-07-30: das Kunden-Objekt heißt „Community"). Die
 * erste Etappe (`sites` → `websites`, control-022) war die Probe an zwei
 * Zeilen — dieselbe Mechanik, eine Stufe größer.
 *
 * WARUM SPALTE UND TABELLE ZUSAMMEN: der Wert in `siteId` ist eine
 * `tenants.$id`. Die Tabelle umzubenennen und die Spalte stehen zu lassen hieße,
 * genau den Halbzustand zu erzeugen, den diese Etappe wegräumt — ein Feld, das
 * anders heißt als das, was drinsteht.
 *
 * NICHT umbenannt wird `tenants` selbst (Etappe 3). Der Wert in `communityId`
 * ist weiterhin eine `tenants`-Row-Id; nur der Name ist schon richtig.
 *
 * DIE ROW-ID WIRD MITGEGEBEN (`rowId: row.$id` statt ID.unique()). Hier hängt
 * noch nichts daran — aber in Etappe 3 steckt dieselbe Id als WERT in jeder
 * `tenantId` jedes gepoolten Projekts und in jedem Site-Label. Die Schleife ist
 * bewusst so geschrieben, dass sie dort unverändert taugt, inklusive
 * Gegenprobe: jede alte Id muss in der neuen Tabelle liegen.
 *
 * IDEMPOTENT: Tabelle/Spalten/Indizes über 409, das Kopieren über eine
 * Existenzprüfung je Row-Id, das Umkopieren in `invite_requests` über den
 * bereits gefüllten Zielwert. Ein zweiter Lauf ändert nichts.
 *
 * DIE ALTEN TABELLEN BLEIBEN STEHEN. Sie fallen separat, erst nachdem der neue
 * Code eine Nacht gelaufen ist — bis dahin ist der Weg zurück ein Deploy und
 * kein Wiederherstellen. Ebenso bleibt `invite_requests.siteId` liegen: eine
 * Spalte zu löschen ist in Appwrite endgültig.
 *
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

const db = databaseId
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

const OLD_MEMBERS = 'site_members'
const NEW_MEMBERS = 'community_members'
const OLD_INVITES = 'site_invites'
const NEW_INVITES = 'community_invites'
const REQUESTS = 'invite_requests'

const MEMBER_ROLES = ['owner', 'admin', 'moderator', 'editor', 'viewer']
/** control-015 legte drei an, control-019 ergänzte 'removed'. */
const MEMBER_STATUSES = ['active', 'invited', 'suspended', 'removed']
const INVITE_STATUSES = ['pending', 'accepted', 'revoked']

interface MemberLike {
  $id: string
  siteId: string
  runtimeProjectId: string
  runtimeUserId: string
  role: string
  status: string
  email: string
  removedAt: string | null
}

interface InviteLike {
  $id: string
  siteId: string
  email: string
  role: string
  tokenHash: string
  status: string
  expiresAt: string
  invitedBy: string
  acceptedBy: string
}

interface RequestLike {
  $id: string
  siteId: string
  communityId: string
}

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

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId })
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

async function waitForColumn(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId })
    const column = columns.find(c => (c as { key?: string }).key === key)
    if (column && (column as { status?: string }).status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Column ${tableId}.${key} wurde nicht 'available'`)
}

/**
 * Kopiert alle Zeilen einer Tabelle in eine andere — MIT ihrer Row-Id — und
 * prüft danach, dass keine fehlt. Die Zuordnung alt→neu macht `mapRow`; dort
 * steht auch die Umbenennung siteId → communityId.
 */
async function copyRows<T extends { $id: string }>(
  from: string,
  to: string,
  mapRow: (row: T) => Record<string, unknown>,
) {
  const alt = await tablesDB.listRows<T>({
    databaseId: db, tableId: from, queries: ['{"method":"limit","values":[500]}'],
  }).catch((error) => {
    if (hasCode(error, 404)) {
      console.log(`↷ Table ${from} existiert nicht mehr — Kopieren übersprungen`)
      return null
    }
    throw error
  })
  if (!alt) return

  console.log(`  ${alt.total} Zeile(n) in ${from}`)
  if (alt.total > alt.rows.length) {
    throw new Error(`${from} hat ${alt.total} Zeilen, geladen wurden nur ${alt.rows.length} — Seitengröße erhöhen, sonst kopiert diese Migration unvollständig.`)
  }

  for (const row of alt.rows) {
    const schon = await tablesDB.getRow({ databaseId: db, tableId: to, rowId: row.$id }).catch(() => null)
    if (schon) {
      console.log(`↷ Row ${row.$id} — schon kopiert`)
      continue
    }
    await tablesDB.createRow({
      databaseId: db,
      tableId: to,
      // DIE ID IST DER PUNKT: nicht ID.unique(), sondern die alte.
      rowId: row.$id,
      data: mapRow(row),
    })
    console.log(`✔ Row ${row.$id} kopiert`)
  }

  // Gegenprobe: jede alte Id liegt in der neuen Tabelle.
  const neu = await tablesDB.listRows<{ $id: string }>({
    databaseId: db, tableId: to, queries: ['{"method":"limit","values":[500]}'],
  })
  const fehlend = alt.rows.filter(row => !neu.rows.some(n => n.$id === row.$id))
  if (fehlend.length > 0) {
    throw new Error(`Kopie ${from} → ${to} unvollständig — fehlende Ids: ${fehlend.map(r => r.$id).join(', ')}`)
  }
  console.log(`✔ Gegenprobe ${to}: ${neu.total} Zeile(n), alle Row-Ids erhalten`)
}

console.log(`Migration control-023 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

// ── 1. community_members — Form 1:1 aus control-015 + 016 + 019 ──────────────
await step(`Table ${NEW_MEMBERS}`, () => tablesDB.createTable({
  databaseId: db, tableId: NEW_MEMBERS, name: 'Community Members',
  permissions: [], // nur Server (Admin-Client) — wie das Original
  rowSecurity: false,
}))

await step(`Column ${NEW_MEMBERS}.communityId`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW_MEMBERS, key: 'communityId', size: 36, required: true,
}))
await step(`Column ${NEW_MEMBERS}.runtimeProjectId`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW_MEMBERS, key: 'runtimeProjectId', size: 36, required: true,
}))
await step(`Column ${NEW_MEMBERS}.runtimeUserId`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW_MEMBERS, key: 'runtimeUserId', size: 36, required: true,
}))
await step(`Column ${NEW_MEMBERS}.role`, () => tablesDB.createEnumColumn({
  databaseId: db, tableId: NEW_MEMBERS, key: 'role', elements: MEMBER_ROLES, required: true,
}))
await step(`Column ${NEW_MEMBERS}.status`, () => tablesDB.createEnumColumn({
  databaseId: db, tableId: NEW_MEMBERS, key: 'status', elements: MEMBER_STATUSES,
  required: false, xdefault: 'active',
}))
// E-Mail nur fürs Einladen/Anzeigen — NIE Autorisierungsschlüssel.
await step(`Column ${NEW_MEMBERS}.email`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW_MEMBERS, key: 'email', size: 254, required: false, xdefault: '',
}))
await step(`Column ${NEW_MEMBERS}.removedAt`, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: NEW_MEMBERS, key: 'removedAt', required: false,
}))

await waitForColumns(NEW_MEMBERS)

// Autorisierung fragt „welche Rolle hat DIESER Runtime-User in DIESER Community?"
await step(`Index ${NEW_MEMBERS}.idx_lookup`, () => tablesDB.createIndex({
  databaseId: db, tableId: NEW_MEMBERS, key: 'idx_lookup', type: TablesDBIndexType.Key,
  columns: ['communityId', 'runtimeProjectId', 'runtimeUserId'],
}))
// Ein User hat je Community GENAU EINE Rolle.
await step(`Index ${NEW_MEMBERS}.uq_member (unique)`, () => tablesDB.createIndex({
  databaseId: db, tableId: NEW_MEMBERS, key: 'uq_member', type: TablesDBIndexType.Unique,
  columns: ['communityId', 'runtimeProjectId', 'runtimeUserId'],
}))
// „Alle Mitglieder dieser Community" (Team-Liste im Kundenbereich).
// Index-NAMEN wandern mit: `idx_site` hieße sonst weiter nach der alten Sache.
await step(`Index ${NEW_MEMBERS}.idx_community`, () => tablesDB.createIndex({
  databaseId: db, tableId: NEW_MEMBERS, key: 'idx_community', type: TablesDBIndexType.Key,
  columns: ['communityId'],
}))
// „Welche Communities gehören diesem Runtime-User?" (control-016).
await step(`Index ${NEW_MEMBERS}.idx_owner`, () => tablesDB.createIndex({
  databaseId: db, tableId: NEW_MEMBERS, key: 'idx_owner', type: TablesDBIndexType.Key,
  columns: ['runtimeProjectId', 'runtimeUserId'],
}))
// Ehemalige Mitglieder gebündelt finden (control-019).
await step(`Index ${NEW_MEMBERS}.idx_community_status`, () => tablesDB.createIndex({
  databaseId: db, tableId: NEW_MEMBERS, key: 'idx_community_status', type: TablesDBIndexType.Key,
  columns: ['communityId', 'status'],
}))

await copyRows<MemberLike>(OLD_MEMBERS, NEW_MEMBERS, row => ({
  communityId: row.siteId,
  runtimeProjectId: row.runtimeProjectId,
  runtimeUserId: row.runtimeUserId,
  role: row.role,
  status: row.status ?? 'active',
  email: row.email ?? '',
  removedAt: row.removedAt ?? null,
}))

// ── 2. community_invites — Form 1:1 aus control-019 ──────────────────────────
await step(`Table ${NEW_INVITES}`, () => tablesDB.createTable({
  databaseId: db, tableId: NEW_INVITES, name: 'Community Invites',
  permissions: [], rowSecurity: false,
}))

await step(`Column ${NEW_INVITES}.communityId`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW_INVITES, key: 'communityId', size: 36, required: true,
}))
await step(`Column ${NEW_INVITES}.email`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW_INVITES, key: 'email', size: 254, required: true,
}))
await step(`Column ${NEW_INVITES}.role`, () => tablesDB.createEnumColumn({
  databaseId: db, tableId: NEW_INVITES, key: 'role', elements: MEMBER_ROLES, required: true,
}))
await step(`Column ${NEW_INVITES}.tokenHash`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW_INVITES, key: 'tokenHash', size: 64, required: true,
}))
await step(`Column ${NEW_INVITES}.status`, () => tablesDB.createEnumColumn({
  databaseId: db, tableId: NEW_INVITES, key: 'status', elements: INVITE_STATUSES,
  required: false, xdefault: 'pending',
}))
await step(`Column ${NEW_INVITES}.expiresAt`, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: NEW_INVITES, key: 'expiresAt', required: true,
}))
await step(`Column ${NEW_INVITES}.invitedBy`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW_INVITES, key: 'invitedBy', size: 36, required: false, xdefault: '',
}))
await step(`Column ${NEW_INVITES}.acceptedBy`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: NEW_INVITES, key: 'acceptedBy', size: 36, required: false, xdefault: '',
}))

await waitForColumns(NEW_INVITES)

// Einlösen sucht über den Hash — und zwar genau EINE Einladung.
await step(`Index ${NEW_INVITES}.uq_token (unique)`, () => tablesDB.createIndex({
  databaseId: db, tableId: NEW_INVITES, key: 'uq_token', type: TablesDBIndexType.Unique,
  columns: ['tokenHash'],
}))
await step(`Index ${NEW_INVITES}.idx_community_status`, () => tablesDB.createIndex({
  databaseId: db, tableId: NEW_INVITES, key: 'idx_community_status', type: TablesDBIndexType.Key,
  columns: ['communityId', 'status'],
}))
// Zweite Einladung an dieselbe Adresse ERSETZT die erste — dafür muss man sie finden.
await step(`Index ${NEW_INVITES}.idx_community_email`, () => tablesDB.createIndex({
  databaseId: db, tableId: NEW_INVITES, key: 'idx_community_email', type: TablesDBIndexType.Key,
  columns: ['communityId', 'email'],
}))

await copyRows<InviteLike>(OLD_INVITES, NEW_INVITES, row => ({
  communityId: row.siteId,
  email: row.email,
  role: row.role,
  tokenHash: row.tokenHash,
  status: row.status ?? 'pending',
  expiresAt: row.expiresAt,
  invitedBy: row.invitedBy ?? '',
  acceptedBy: row.acceptedBy ?? '',
}))

// ── 3. invite_requests: neue Spalte NEBEN der alten, Werte umkopieren ────────
// Diese Tabelle behält ihren Namen — hier wandert nur die Spalte. Additiv, weil
// eine Appwrite-Spalte weder umbenannt noch gefahrlos gelöscht werden kann.
await step(`Column ${REQUESTS}.communityId`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: REQUESTS, key: 'communityId', size: 36, required: false, xdefault: '',
}))
await waitForColumn(REQUESTS, 'communityId')

{
  const alle = await tablesDB.listRows<RequestLike>({
    databaseId: db, tableId: REQUESTS, queries: ['{"method":"limit","values":[500]}'],
  })
  console.log(`  ${alle.total} Zeile(n) in ${REQUESTS}`)
  if (alle.total > alle.rows.length) {
    throw new Error(`${REQUESTS} hat ${alle.total} Zeilen, geladen wurden nur ${alle.rows.length} — Seitengröße erhöhen.`)
  }
  let umkopiert = 0
  for (const row of alle.rows) {
    if (!row.siteId) continue // nie eingelöst — nichts zu übertragen
    if (row.communityId === row.siteId) continue // idempotent
    await tablesDB.updateRow({
      databaseId: db, tableId: REQUESTS, rowId: row.$id, data: { communityId: row.siteId },
    })
    umkopiert++
  }
  console.log(`✔ ${REQUESTS}.communityId: ${umkopiert} Zeile(n) übertragen`)

  // Gegenprobe: keine Zeile hat ein gefülltes siteId ohne gleiches communityId.
  const nachher = await tablesDB.listRows<RequestLike>({
    databaseId: db, tableId: REQUESTS, queries: ['{"method":"limit","values":[500]}'],
  })
  const abweichend = nachher.rows.filter(row => row.siteId && row.communityId !== row.siteId)
  if (abweichend.length > 0) {
    throw new Error(`${REQUESTS}: ${abweichend.length} Zeile(n) mit abweichendem communityId — ${abweichend.map(r => r.$id).join(', ')}`)
  }
  console.log(`✔ Gegenprobe ${REQUESTS}: alle eingelösten Zeilen tragen communityId`)
}

console.log('✔ Migration control-023 fertig')
console.log('  `site_members` und `site_invites` bleiben bewusst stehen, ebenso')
console.log('  `invite_requests.siteId` — Löschen ist ein eigener Schritt, frühestens')
console.log('  nachdem der neue Code eine Nacht gelaufen ist.')
