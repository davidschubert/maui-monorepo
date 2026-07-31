/**
 * Migration control-019: Mitglieder-Verwaltung für Community-Betreiber
 * (Audit-Befund S9 „tote Capability team.manage", Davids Entscheidungen vom
 * 2026-07-29).
 *
 * Drei Teile:
 *  1. `site_members.status` um **'removed'** erweitern — „Entfernen" entzieht nur
 *     den ZUGANG und löscht nichts (Entscheidung 1). Der Status ist zugleich die
 *     positive Tatsache, aus der eine Ansicht „Ehemaliges Mitglied" ableiten
 *     kann; die ABWESENHEIT einer Row bedeutet das ausdrücklich nicht (Gäste und
 *     Konten, die hier nie beigetreten sind, haben ebenfalls keine). Seit A5
 *     (2026-07-29) ist 'removed' zusätzlich die Sperre gegen Wiederbeitritt:
 *     `members/join` liest jeden Status und lässt eine entzogene Zeile nicht
 *     durch einen Beitritts-Auslöser überschreiben.
 *  2. `site_members.removedAt` — wann der Zugang entzogen wurde (Anzeige/Spur).
 *  3. `site_invites` — offene Einladungen, dem M9-Muster (`workspace_invites`,
 *     control-008) nachgebaut: die DB kennt nur den SHA-256-Hash des Tokens.
 *
 * Idempotent (409 → skip; die Enum-Erweiterung prüft vorher die Elemente).
 * Aufruf über den Runner:
 *   pnpm migrate --app control --layer control
 */
import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite'
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

console.log(`Migration control-019 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// ── 1. site_members.status += 'removed' ─────────────────────────────────────
// destruktiv-ok: `updateEnumColumn` ist der EINZIGE Weg, einen Wert zu einem
// Appwrite-Enum hinzuzufügen — es gibt kein additives „addElement". Zerstörerisch
// wäre der Aufruf nur, wenn er die Elementliste VERKÜRZTE: das Update ERSETZT
// sie. Genau dagegen ist der Ablauf unten gebaut — erst die bestehenden Elemente
// LESEN, dann `[...existing, ...missing]` schicken, und wenn nichts fehlt, gar
// nicht schreiben. Kein Wert wird entfernt, keine Zeile verändert; required und
// Default werden aus der bestehenden Spalte übernommen, damit das Update sie
// nicht still umstellt.
const REQUIRED_STATUSES = ['active', 'invited', 'suspended', 'removed']
{
  const { columns } = await tablesDB.listColumns({ databaseId, tableId: 'site_members' })
  const column = columns.find(c => (c as { key?: string }).key === 'status') as
    { elements?: string[], required?: boolean, default?: string } | undefined
  if (!column) {
    throw new Error('site_members.status fehlt — Migration control-015 zuerst laufen lassen')
  }
  const existing = column.elements ?? []
  const missing = REQUIRED_STATUSES.filter(value => !existing.includes(value))
  if (missing.length === 0) {
    console.log('↷ Enum site_members.status (enthält \'removed\' schon)')
  }
  else {
    const elements = [...existing, ...missing]
    await tablesDB.updateEnumColumn({
      databaseId,
      tableId: 'site_members',
      key: 'status',
      elements,
      required: column.required ?? false,
      xdefault: column.default ?? 'active',
    })
    console.log(`✔ Enum site_members.status erweitert → ${elements.join(', ')}`)
  }
}

await step('Column site_members.removedAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'site_members', key: 'removedAt', required: false,
}))
await waitForColumn('site_members', 'removedAt')

// Ehemalige Mitglieder einer Site gebündelt finden (die Kennzeichnung im
// Kommentar-Strom fragt genau so: „welche dieser Autoren sind hier raus?").
await indexStep('Index site_members.idx_site_status', () => tablesDB.createIndex({
  databaseId, tableId: 'site_members', key: 'idx_site_status', type: TablesDBIndexType.Key,
  columns: ['siteId', 'status'],
}))

// ── 2. site_invites (offene Einladungen; nur Token-HASH) ────────────────────
await step('Table site_invites', () => tablesDB.createTable({
  databaseId, tableId: 'site_invites', name: 'Site Invites', rowSecurity: false, permissions: [],
}))
await step('Column site_invites.siteId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'site_invites', key: 'siteId', size: 36, required: true,
}))
await step('Column site_invites.email', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'site_invites', key: 'email', size: 254, required: true,
}))
await step('Column site_invites.role', () => tablesDB.createEnumColumn({
  databaseId, tableId: 'site_invites', key: 'role',
  elements: ['owner', 'admin', 'moderator', 'editor', 'viewer'], required: true,
}))
await step('Column site_invites.tokenHash', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'site_invites', key: 'tokenHash', size: 64, required: true,
}))
await step('Column site_invites.status', () => tablesDB.createEnumColumn({
  databaseId, tableId: 'site_invites', key: 'status',
  elements: ['pending', 'accepted', 'revoked'], required: false, xdefault: 'pending',
}))
await step('Column site_invites.expiresAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'site_invites', key: 'expiresAt', required: true,
}))
await step('Column site_invites.invitedBy', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'site_invites', key: 'invitedBy', size: 36, required: false, xdefault: '',
}))
await step('Column site_invites.acceptedBy', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'site_invites', key: 'acceptedBy', size: 36, required: false, xdefault: '',
}))

await waitForColumn('site_invites', 'tokenHash')
await waitForColumn('site_invites', 'siteId')
await waitForColumn('site_invites', 'status')

// Einlösen sucht über den Hash — und zwar genau EINE Einladung.
await indexStep('Unique-Index site_invites.uq_token', () => tablesDB.createIndex({
  databaseId, tableId: 'site_invites', key: 'uq_token', type: TablesDBIndexType.Unique,
  columns: ['tokenHash'],
}))
// „Offene Einladungen dieser Community" (die Liste im Dashboard).
await indexStep('Index site_invites.idx_site_status', () => tablesDB.createIndex({
  databaseId, tableId: 'site_invites', key: 'idx_site_status', type: TablesDBIndexType.Key,
  columns: ['siteId', 'status'],
}))
// Zweite Einladung an dieselbe Adresse ERSETZT die erste — dafür muss man sie finden.
await indexStep('Index site_invites.idx_site_email', () => tablesDB.createIndex({
  databaseId, tableId: 'site_invites', key: 'idx_site_email', type: TablesDBIndexType.Key,
  columns: ['siteId', 'email'],
}))

console.log('✔ Migration control-019 fertig')
