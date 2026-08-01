import { Client, ID, TablesDB } from 'node-appwrite'
import { afterAll, describe, expect, it } from 'vitest'
import { createTenantsTableResolver, mapTenantRowToContext } from '../server/utils/tenantsResolver'
import { COMMUNITIES_TABLE, parseTenantPlanLimits } from '../shared/types/tenantRecord'

/**
 * HINWEIS ZU `audience: 'members'` IN JEDER ERWARTUNG (C18): der Resolver ist
 * die EINZIGE Stelle, an der die Spalte fail-closed gelesen wird
 * (resolveTenantAudience). Eine Fixture ohne das Feld ist eine Bestands-Row —
 * und die ist per Definition „nur für Mitglieder". Der neue ÖFFENTLICH-Default
 * gilt beim ANLEGEN (onboardingProvision), nicht beim Lesen.
 */
describe('mapTenantRowToContext (pure)', () => {
  it('active silo → silo-Context', () => {
    expect(mapTenantRowToContext({ mode: 'silo', projectId: 'p1', tenantId: '', status: 'active', plan: '' }))
      .toEqual({ mode: 'silo', projectId: 'p1', openRegistration: true, audience: 'members' })
  })
  it('active pool → pool-Context mit tenantId + Plan-Default basic', () => {
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: '' }))
      .toEqual({ mode: 'pool', projectId: 'shared', tenantId: 't-1', plan: 'basic', openRegistration: true, audience: 'members' })
  })
  it('disabled → null (Host bewusst offline)', () => {
    expect(mapTenantRowToContext({ mode: 'silo', projectId: 'p1', tenantId: '', status: 'disabled', plan: '' })).toBeNull()
  })
  it('pool OHNE tenantId → null (nie ungescoped durchlassen)', () => {
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: '', status: 'active', plan: '' })).toBeNull()
  })
  it('kein Row → null', () => {
    expect(mapTenantRowToContext(null)).toBeNull()
  })
  it('Plan-Katalog: Limits des Plans reisen aufgelöst im Context', () => {
    const catalog = {
      basic: { comments: { perDay: 200, total: 5000 } },
      personal: { comments: { perDay: 1000, total: 50000 } },
    }
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: 'personal' }, catalog))
      .toEqual({ mode: 'pool', projectId: 'shared', tenantId: 't-1', plan: 'personal', limits: { comments: { perDay: 1000, total: 50000 } }, openRegistration: true, audience: 'members' })
  })
  it('Plan-Katalog: unbekannter Plan wird auf basic normalisiert', () => {
    const catalog = { basic: { comments: { perDay: 200 } } }
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: 'enterprise' as never }, catalog))
      .toEqual({ mode: 'pool', projectId: 'shared', tenantId: 't-1', plan: 'basic', limits: { comments: { perDay: 200 } }, openRegistration: true, audience: 'members' })
  })
  it('leerer Katalog: Context ohne limits (app.config-Fallback greift)', () => {
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: 'pro' }, {}))
      .toEqual({ mode: 'pool', projectId: 'shared', tenantId: 't-1', plan: 'pro', openRegistration: true, audience: 'members' })
  })
  it('G1: $id reist als communityId in den Context (pool + silo)', () => {
    expect(mapTenantRowToContext({ $id: 'site-abc', mode: 'silo', projectId: 'p1', tenantId: '', status: 'active', plan: '' }))
      .toEqual({ mode: 'silo', projectId: 'p1', communityId: 'site-abc', openRegistration: true, audience: 'members' })
    expect(mapTenantRowToContext({ $id: 'site-xyz', mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: '' }))
      .toEqual({ mode: 'pool', projectId: 'shared', tenantId: 't-1', plan: 'basic', communityId: 'site-xyz', openRegistration: true, audience: 'members' })
  })
  it('M13: trialEndsAt reist in den Pool-Context — leer heißt „keine Testphase"', () => {
    const end = '2026-08-14T12:00:00.000Z'
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: 'pro', trialEndsAt: end }))
      .toMatchObject({ trialEndsAt: end })
    // Fehlend/null/'' lässt das Feld WEG statt einen leeren String zu tragen —
    // der Hinweis prüft auf Anwesenheit, nicht auf Inhalt.
    for (const value of [undefined, null, '']) {
      expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: 'pro', trialEndsAt: value }))
        .not.toHaveProperty('trialEndsAt')
    }
    // Silo = Enterprise-Vertrag, dort gibt es keine Testphase.
    expect(mapTenantRowToContext({ mode: 'silo', projectId: 'p1', tenantId: '', status: 'active', plan: '', trialEndsAt: end }))
      .not.toHaveProperty('trialEndsAt')
  })
  it('S1: openRegistration=false reist in den Context (pool + silo)', () => {
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: '', openRegistration: false }))
      .toMatchObject({ openRegistration: false })
    expect(mapTenantRowToContext({ mode: 'silo', projectId: 'p1', tenantId: '', status: 'active', plan: '', openRegistration: false }))
      .toMatchObject({ openRegistration: false })
  })
  it('C18: audience reist in den Context — fail-CLOSED gelesen', () => {
    // Bewusster Gegensatz zu openRegistration eine Zeile darüber: dort
    // fail-OPEN (Produktentscheidung), hier fail-CLOSED (Datenschutzgrenze).
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: '', audience: 'public' }))
      .toMatchObject({ audience: 'public' })
    for (const audience of [null, undefined, '', 'members', 'PUBLIC', 'any']) {
      expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: '', audience }), String(audience))
        .toMatchObject({ audience: 'members' })
    }
    // Silo genauso — eine Community mit eigenem Projekt darf sich ebenso
    // zumachen; die Row-Permission ist dort Role.users() statt eines Labels.
    expect(mapTenantRowToContext({ mode: 'silo', projectId: 'p1', tenantId: '', status: 'active', plan: '', audience: 'public' }))
      .toMatchObject({ audience: 'public' })
  })
  it('B5: die Neutral-Palette reist als Branding mit — attribut-geprüft', () => {
    // `neutral` (control-020) landet als data-neutral im <html> jeder Seite
    // dieser Community, deshalb dieselbe isSafeThemeToken-Linie wie theme/variant.
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: '', theme: 'lagoon', variant: 'deep', neutral: 'taupe' }))
      .toMatchObject({ theme: 'lagoon', variant: 'deep', neutral: 'taupe' })
    // Eigene Achse: Palette ohne Theme ist ein gültiger Zustand.
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: '', neutral: 'stone' }))
      .toMatchObject({ neutral: 'stone' })
  })
  it('B5: leere/fehlende/unsichere Palette lässt das Feld weg', () => {
    // Kein Feld = „die Community hat nichts gewählt" (Bestands-Rows von vor
    // control-020 lesen sich als undefined — Appwrite backfillt nicht).
    for (const neutral of ['', null, undefined, 'mist" onload=x', 'MIST']) {
      expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: '', neutral }))
        .not.toHaveProperty('neutral')
    }
  })
  it('S1: Bestands-Row ohne die Spalte (null/undefined) bleibt OFFEN', () => {
    // Appwrite backfillt Spalten-Defaults nicht — Rows von vor control-018
    // lesen sich als null. Fail-OPEN ist hier Absicht: eine Community, die nie
    // etwas entschieden hat, darf nicht stillschweigend zugemacht werden.
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: '', openRegistration: null }))
      .toMatchObject({ openRegistration: true, audience: 'members' })
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: '' }))
      .toMatchObject({ openRegistration: true, audience: 'members' })
  })
})

describe('parseTenantPlanLimits (pure, defensiv)', () => {
  it('parst gültiges Limits-JSON', () => {
    expect(parseTenantPlanLimits('{"comments":{"perDay":200,"total":5000}}'))
      .toEqual({ comments: { perDay: 200, total: 5000 } })
  })
  it('kaputtes JSON → {}', () => {
    expect(parseTenantPlanLimits('nope{')).toEqual({})
  })
  it('fremde/negative Werte werden verworfen, gültige bleiben', () => {
    expect(parseTenantPlanLimits('{"comments":{"perDay":-5,"total":100,"x":"y"},"posts":"kaputt","pages":{"perDay":3}}'))
      .toEqual({ comments: { total: 100 }, pages: { perDay: 3 } })
  })
  it('Array/Skalar → {}', () => {
    expect(parseTenantPlanLimits('[1,2]')).toEqual({})
    expect(parseTenantPlanLimits('42')).toEqual({})
  })
})

/**
 * Integration gegen eine ECHTE Appwrite (tenants-Table, Migration control-010).
 * Env-gated wie die anderen Live-Tests: Env der control-App exportieren.
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const hasEnv = !!(endpoint && projectId && databaseId && apiKey)

describe.skipIf(!hasEnv)('createTenantsTableResolver (echte Appwrite)', () => {
  const tablesDB = hasEnv
    ? new TablesDB(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    : null!
  const createdIds: string[] = []
  const HOST_POOL = `pool-${Date.now()}.test.local`
  const HOST_OFF = `off-${Date.now()}.test.local`

  afterAll(async () => {
    for (const id of createdIds) {
      await tablesDB.deleteRow({ databaseId: databaseId!, tableId: COMMUNITIES_TABLE, rowId: id }).catch(() => {})
    }
  })

  it('löst pool/disabled/unknown korrekt auf und cached (positiv wie negativ)', async () => {
    const poolRow = await tablesDB.createRow({
      databaseId: databaseId!, tableId: COMMUNITIES_TABLE, rowId: ID.unique(),
      data: { host: HOST_POOL, mode: 'pool', projectId: 'shared-project', tenantId: 't-demo', status: 'active' },
    })
    createdIds.push(poolRow.$id)
    const offRow = await tablesDB.createRow({
      databaseId: databaseId!, tableId: COMMUNITIES_TABLE, rowId: ID.unique(),
      data: { host: HOST_OFF, mode: 'silo', projectId: 'p-off', tenantId: '', status: 'disabled' },
    })
    createdIds.push(offRow.$id)

    const resolve = createTenantsTableResolver({
      endpoint: endpoint!, projectId: projectId!, apiKey: apiKey!, databaseId: databaseId!, cacheTtlMs: 60_000,
    })

    // Seit control-014 reisen die Katalog-Limits (tenant_plans) im Context mit —
    // Plan-Default basic, Limits aus dem Seed/aktuellen Katalog (Zahlen variabel,
    // Control-editierbar: nur Struktur prüfen, nicht die konkreten Werte).
    const resolved = await resolve(HOST_POOL)
    expect(resolved).toMatchObject({ mode: 'pool', projectId: 'shared-project', tenantId: 't-demo', plan: 'basic' })
    if (resolved?.mode === 'pool' && resolved.limits) {
      expect(resolved.limits.comments?.perDay).toBeTypeOf('number')
    }
    await expect(resolve(HOST_OFF)).resolves.toBeNull()
    await expect(resolve('gibt-es-nicht.test.local')).resolves.toBeNull()

    // Cache-Beweis: Row ändern — innerhalb der TTL bleibt die ALTE Auflösung
    await tablesDB.updateRow({ databaseId: databaseId!, tableId: COMMUNITIES_TABLE, rowId: poolRow.$id, data: { status: 'disabled' } })
    await expect(resolve(HOST_POOL)).resolves.toEqual(resolved)
  })
})
