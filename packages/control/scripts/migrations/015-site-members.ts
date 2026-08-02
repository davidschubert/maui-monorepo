/**
 * Migration control-015 (G1): Kunden-Site-Autorisierung.
 *
 * Zwei Teile:
 *  1. `tenants.workspaceId` — Billing-/Owner-Anker. Entscheidung G0: die
 *     kanonische Kunden-Site IST der Tenant (`tenants.$id` = siteId); `sites`
 *     bleibt das Operator-/Infra-Register. Billing-Verdrahtung folgt in G2/G3;
 *     hier nur die Spalte. '' = noch kein Workspace zugeordnet.
 *  2. `site_members` — die Site-Rollen-Mitgliedschaft (Route-Autorisierung).
 *     Anker: `{siteId = tenants.$id, runtimeProjectId, runtimeUserId}`. Die
 *     Runtime-Identität (Pool-/Silo-Projekt-User) wird bewusst NICHT mit der
 *     Control-Plane-/Studio-userId gleichgesetzt. Zugriff nur über Studio-
 *     Admin-Routen + den read-only-Cross-Projekt-Key der Platform-App
 *     (requireTenantPermission) — keine Table-read-Permissions.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *   pnpm migrate --app control --layer control
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

console.log(`Migration control-015 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// ── 1. tenants.workspaceId (Billing-Anker; siteId = tenants.$id) ─────────────
await step('Column tenants.workspaceId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tenants', key: 'workspaceId', size: 36, required: false, xdefault: '',
}))

// ── 2. site_members (Site-Rollen; Zugriff nur über Server-Routen) ───────────
await step('Table site_members', () => tablesDB.createTable({
  databaseId, tableId: 'site_members', name: 'Site Members', rowSecurity: false, permissions: [],
}))
await step('Column site_members.siteId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'site_members', key: 'siteId', size: 36, required: true,
}))
await step('Column site_members.runtimeProjectId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'site_members', key: 'runtimeProjectId', size: 36, required: true,
}))
await step('Column site_members.runtimeUserId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'site_members', key: 'runtimeUserId', size: 36, required: true,
}))
await step('Column site_members.role', () => tablesDB.createEnumColumn({
  databaseId, tableId: 'site_members', key: 'role',
  elements: ['owner', 'admin', 'moderator', 'editor', 'viewer'], required: true,
}))
await step('Column site_members.status', () => tablesDB.createEnumColumn({
  databaseId, tableId: 'site_members', key: 'status',
  elements: ['active', 'invited', 'suspended'], required: false, xdefault: 'active',
}))
// E-Mail nur fürs Einladen/Anzeigen — NIE Autorisierungsschlüssel.
await step('Column site_members.email', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'site_members', key: 'email', size: 254, required: false, xdefault: '',
}))
await waitForColumn('site_members', 'siteId')
await waitForColumn('site_members', 'runtimeUserId')
await waitForColumn('site_members', 'role')

// Lookup-Index: Autorisierung fragt „welche Rolle hat DIESER Runtime-User auf
// DIESER Site?" → (siteId, runtimeProjectId, runtimeUserId).
await indexStep('Index site_members.idx_lookup', {
  tableId: 'site_members', key: 'idx_lookup', type: TablesDBIndexType.Key,
  columns: ['siteId', 'runtimeProjectId', 'runtimeUserId'],
})
// Ein User hat je Site GENAU EINE Rolle — Unique verhindert Doppel-Rows.
await indexStep('Unique-Index site_members.uq_member', {
  tableId: 'site_members', key: 'uq_member', type: TablesDBIndexType.Unique,
  columns: ['siteId', 'runtimeProjectId', 'runtimeUserId'],
})
// „Alle Mitglieder dieser Site" (Team-Liste im Kundenbereich).
await indexStep('Index site_members.idx_site', {
  tableId: 'site_members', key: 'idx_site', type: TablesDBIndexType.Key, columns: ['siteId'],
})

console.log('✔ Migration control-015 fertig')
