import { Client, ID, TablesDB } from 'node-appwrite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSiteMembersResolver } from '../server/utils/siteMembersResolver'
import { SITE_MEMBERS_TABLE, SITE_ROLES } from '../shared/types/siteMember'
import { tenantRoleHasCapability, isTenantRole } from '../../core/shared/tenantAuthz'

/**
 * G1-5 — automatisierter ISOLATIONSBEWEIS der Kunden-Site-Rollen gegen eine
 * ECHTE Appwrite-Instanz (das Control Plane / studio). Beweist die harten
 * Zusagen aus G0/G1:
 *   - DERSELBE Runtime-User hat in zwei Pool-Sites VERSCHIEDENE Rollen.
 *   - Alle 5 Rollen lösen korrekt auf (+ ihre Capability-Grenzen).
 *   - Silo-Membership (anderes runtimeProjectId) läuft über denselben Pfad.
 *   - invited/suspended zählen NICHT (nur active → Rolle).
 *   - Revoke (Row weg) → keine Rolle mehr (Cache-TTL 0 im Test).
 *   - Owner-Übergabe: alte Owner-Row → admin, neue → owner.
 *   - „Break-glass"-Trennung: ein User OHNE Membership hat KEINE Site-Rolle
 *     (die Operator-Welt leakt nicht implizit in die Site-Welt).
 *
 * Env-gated wie der comments-Isolationsbeweis: ohne Appwrite-Env skippt die
 * Suite. Lokal: `set -a; source apps/studio/.env` vor `pnpm --filter
 * @maui/studio test`. CI: e2e.yml liefert die Wegwerf-Instanz.
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
const hasEnv = !!(endpoint && projectId && databaseId && apiKey)

const STAMP = `${Date.now()}`
const POOL = `pool-proj-${STAMP}`
const SILO = `silo-proj-${STAMP}`
const USER = `runtime-user-${STAMP}` // EIN Mensch, mehrere Sites
const SITE_A = `siteA${STAMP}`
const SITE_B = `siteB${STAMP}`

describe.skipIf(!hasEnv)('Site-Rollen-Isolationsbeweis (echte Appwrite, site_members)', () => {
  const tablesDB = hasEnv
    ? new TablesDB(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    : null!
  // TTL 0 → jeder resolver-Aufruf liest frisch (Revoke sofort sichtbar im Test).
  const resolve = hasEnv
    ? createSiteMembersResolver({ endpoint: endpoint!, projectId: projectId!, apiKey: apiKey!, databaseId: databaseId!, cacheTtlMs: 0 })
    : null!
  const createdIds: string[] = []

  async function addMember(siteId: string, runtimeProjectId: string, runtimeUserId: string, role: string, status = 'active'): Promise<string> {
    const row = await tablesDB.createRow({
      databaseId: databaseId!,
      tableId: SITE_MEMBERS_TABLE,
      rowId: ID.unique(),
      data: { siteId, runtimeProjectId, runtimeUserId, role, status, email: '' },
    })
    createdIds.push(row.$id)
    return row.$id
  }

  beforeAll(async () => {
    // Derselbe User: owner in Site A, viewer in Site B.
    await addMember(SITE_A, POOL, USER, 'owner')
    await addMember(SITE_B, POOL, USER, 'viewer')
  })

  afterAll(async () => {
    for (const id of createdIds) {
      await tablesDB.deleteRow({ databaseId: databaseId!, tableId: SITE_MEMBERS_TABLE, rowId: id }).catch(() => {})
    }
  })

  it('derselbe Runtime-User hat je Site eine ANDERE Rolle', async () => {
    expect(await resolve({ siteId: SITE_A, runtimeProjectId: POOL, runtimeUserId: USER })).toBe('owner')
    expect(await resolve({ siteId: SITE_B, runtimeProjectId: POOL, runtimeUserId: USER })).toBe('viewer')
  })

  it('Capability-Grenzen greifen an der aufgelösten Rolle', async () => {
    const roleA = await resolve({ siteId: SITE_A, runtimeProjectId: POOL, runtimeUserId: USER })
    const roleB = await resolve({ siteId: SITE_B, runtimeProjectId: POOL, runtimeUserId: USER })
    expect(isTenantRole(roleA!) && tenantRoleHasCapability(roleA!, 'site.delete')).toBe(true) // owner
    expect(isTenantRole(roleB!) && tenantRoleHasCapability(roleB!, 'posts.write')).toBe(false) // viewer
  })

  it('alle 5 Rollen lösen korrekt auf', async () => {
    const site = `siteRoles${STAMP}`
    for (const role of SITE_ROLES) {
      await addMember(site, POOL, `u-${role}-${STAMP}`, role)
    }
    for (const role of SITE_ROLES) {
      expect(await resolve({ siteId: site, runtimeProjectId: POOL, runtimeUserId: `u-${role}-${STAMP}` })).toBe(role)
    }
  })

  it('Silo-Membership (anderes runtimeProjectId) läuft über denselben Pfad', async () => {
    const site = `siteSilo${STAMP}`
    await addMember(site, SILO, USER, 'admin')
    expect(await resolve({ siteId: site, runtimeProjectId: SILO, runtimeUserId: USER })).toBe('admin')
    // gleicher User + gleiche Site, aber Pool-Projekt → KEINE Rolle (Projekt-Anker)
    expect(await resolve({ siteId: site, runtimeProjectId: POOL, runtimeUserId: USER })).toBeNull()
  })

  it('invited/suspended zählen NICHT (nur active → Rolle)', async () => {
    const site = `siteStatus${STAMP}`
    await addMember(site, POOL, `u-invited-${STAMP}`, 'admin', 'invited')
    await addMember(site, POOL, `u-suspended-${STAMP}`, 'admin', 'suspended')
    expect(await resolve({ siteId: site, runtimeProjectId: POOL, runtimeUserId: `u-invited-${STAMP}` })).toBeNull()
    expect(await resolve({ siteId: site, runtimeProjectId: POOL, runtimeUserId: `u-suspended-${STAMP}` })).toBeNull()
  })

  it('Revoke: Row entfernt → keine Rolle mehr', async () => {
    const site = `siteRevoke${STAMP}`
    const rowId = await addMember(site, POOL, `u-revoke-${STAMP}`, 'moderator')
    expect(await resolve({ siteId: site, runtimeProjectId: POOL, runtimeUserId: `u-revoke-${STAMP}` })).toBe('moderator')
    await tablesDB.deleteRow({ databaseId: databaseId!, tableId: SITE_MEMBERS_TABLE, rowId })
    createdIds.splice(createdIds.indexOf(rowId), 1)
    expect(await resolve({ siteId: site, runtimeProjectId: POOL, runtimeUserId: `u-revoke-${STAMP}` })).toBeNull()
  })

  it('Owner-Übergabe: alter Owner → admin, neuer → owner', async () => {
    const site = `siteXfer${STAMP}`
    const oldOwnerRow = await addMember(site, POOL, `u-old-${STAMP}`, 'owner')
    const newOwnerRow = await addMember(site, POOL, `u-new-${STAMP}`, 'admin')
    await tablesDB.updateRow({ databaseId: databaseId!, tableId: SITE_MEMBERS_TABLE, rowId: oldOwnerRow, data: { role: 'admin' } })
    await tablesDB.updateRow({ databaseId: databaseId!, tableId: SITE_MEMBERS_TABLE, rowId: newOwnerRow, data: { role: 'owner' } })
    expect(await resolve({ siteId: site, runtimeProjectId: POOL, runtimeUserId: `u-old-${STAMP}` })).toBe('admin')
    expect(await resolve({ siteId: site, runtimeProjectId: POOL, runtimeUserId: `u-new-${STAMP}` })).toBe('owner')
  })

  it('Break-glass-Trennung: User OHNE Membership hat KEINE Site-Rolle', async () => {
    expect(await resolve({ siteId: SITE_A, runtimeProjectId: POOL, runtimeUserId: `stranger-${STAMP}` })).toBeNull()
  })

  it('DB-Enum erzwingt gültige Rollen (kein Fremd-Rollen-Insert möglich)', async () => {
    await expect(addMember(`siteBad${STAMP}`, POOL, `u-bad-${STAMP}`, 'superuser')).rejects.toBeTruthy()
  })
})
