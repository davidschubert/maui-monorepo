import { describe, expect, it } from 'vitest'
import { closeOverRequires, pickLookupKey, planToGrants, subscriptionUpdateToAction } from '../shared/workspaceBilling'
import type { StudioPlanCatalog } from '../shared/types/workspace'

const CATALOG = [
  { key: 'comments', requires: ['moderation'] },
  { key: 'moderation', requires: [] },
  { key: 'posts', requires: ['moderation'] },
  { key: 'events', requires: [] },
  { key: 'activity', requires: [] },
]

const PLANS: StudioPlanCatalog = {
  free: { lookupKey: null, features: ['comments'] },
  pro: { lookupKey: 'workspace_pro_monthly', lookupKeyYearly: 'workspace_pro_yearly', features: ['comments', 'posts', 'events'] },
}

describe('closeOverRequires', () => {
  it('schließt transitiv über requires und sortiert', () => {
    expect(closeOverRequires(['comments'], CATALOG)).toEqual(['comments', 'moderation'])
    expect(closeOverRequires(['posts', 'events'], CATALOG)).toEqual(['events', 'moderation', 'posts'])
  })

  it('dedupliziert bei mehrfachen requires auf dasselbe Feature', () => {
    expect(closeOverRequires(['comments', 'posts'], CATALOG)).toEqual(['comments', 'moderation', 'posts'])
  })

  it('wirft bei unbekanntem Feature statt still zu verschlucken', () => {
    expect(() => closeOverRequires(['tippfehler'], CATALOG)).toThrow(/Unbekanntes Feature "tippfehler"/)
  })

  it('leeres Set bleibt leer', () => {
    expect(closeOverRequires([], CATALOG)).toEqual([])
  })
})

describe('pickLookupKey (Monats-/Jahres-Intervall)', () => {
  it('wählt den Monats- bzw. Jahres-lookup_key', () => {
    expect(pickLookupKey(PLANS.pro!, 'monthly')).toBe('workspace_pro_monthly')
    expect(pickLookupKey(PLANS.pro!, 'yearly')).toBe('workspace_pro_yearly')
  })
  it('free (kein Preis) bleibt null in beiden Intervallen', () => {
    expect(pickLookupKey(PLANS.free!, 'monthly')).toBeNull()
    expect(pickLookupKey(PLANS.free!, 'yearly')).toBeNull()
  })
  it('fehlt der Jahrespreis, fällt yearly bewusst auf den Monatspreis zurück', () => {
    expect(pickLookupKey({ lookupKey: 'only_monthly' }, 'yearly')).toBe('only_monthly')
  })
})

describe('planToGrants', () => {
  it('liefert das requires-geschlossene Set für jede Site', () => {
    const grants = planToGrants('pro', PLANS, CATALOG, ['site-a', 'site-b'])
    expect(grants).toEqual([
      { siteProjectId: 'site-a', features: ['comments', 'events', 'moderation', 'posts'] },
      { siteProjectId: 'site-b', features: ['comments', 'events', 'moderation', 'posts'] },
    ])
  })

  it('wirft bei unbekanntem Plan', () => {
    expect(() => planToGrants('enterprise', PLANS, CATALOG, ['site-a'])).toThrow(/Unbekannter Plan "enterprise"/)
  })

  it('Workspace ohne Sites → keine Grants, kein Fehler', () => {
    expect(planToGrants('free', PLANS, CATALOG, [])).toEqual([])
  })
})

describe('subscriptionUpdateToAction', () => {
  const meta = (extra: Record<string, string> = {}) => ({ workspaceId: 'ws-1', plan: 'pro', ...extra })

  it('active/trialing wenden den Plan aus der Metadata an', () => {
    expect(subscriptionUpdateToAction({ status: 'active', metadata: meta() }, PLANS))
      .toEqual({ kind: 'apply-plan', workspaceId: 'ws-1', plan: 'pro' })
    expect(subscriptionUpdateToAction({ status: 'trialing', metadata: meta() }, PLANS))
      .toEqual({ kind: 'apply-plan', workspaceId: 'ws-1', plan: 'pro' })
  })

  it('ohne workspaceId-Metadata wird ignoriert (fremdes Abo, z. B. Site-Billing)', () => {
    expect(subscriptionUpdateToAction({ status: 'active', metadata: { plan: 'pro' } }, PLANS))
      .toEqual({ kind: 'ignore', reason: 'no-workspace-metadata' })
  })

  it('unbekannter/fehlender Plan wird ignoriert statt geraten', () => {
    expect(subscriptionUpdateToAction({ status: 'active', metadata: meta({ plan: 'enterprise' }) }, PLANS).kind).toBe('ignore')
    expect(subscriptionUpdateToAction({ status: 'active', metadata: { workspaceId: 'ws-1' } }, PLANS).kind).toBe('ignore')
  })

  it('past_due/unpaid markieren nur den Status (Grants bleiben — Stripe-Dunning ist die Grace)', () => {
    expect(subscriptionUpdateToAction({ status: 'past_due', metadata: meta() }, PLANS))
      .toEqual({ kind: 'past-due', workspaceId: 'ws-1' })
    expect(subscriptionUpdateToAction({ status: 'unpaid', metadata: meta() }, PLANS))
      .toEqual({ kind: 'past-due', workspaceId: 'ws-1' })
  })

  it('canceled/incomplete_expired fallen aufs free-Set zurück (nie auf null Features)', () => {
    expect(subscriptionUpdateToAction({ status: 'canceled', metadata: meta() }, PLANS))
      .toEqual({ kind: 'free-fallback', workspaceId: 'ws-1' })
    expect(subscriptionUpdateToAction({ status: 'incomplete_expired', metadata: meta() }, PLANS))
      .toEqual({ kind: 'free-fallback', workspaceId: 'ws-1' })
  })

  it('incomplete/paused/Unbekanntes fasst nichts an', () => {
    expect(subscriptionUpdateToAction({ status: 'incomplete', metadata: meta() }, PLANS).kind).toBe('ignore')
    expect(subscriptionUpdateToAction({ status: 'paused', metadata: meta() }, PLANS).kind).toBe('ignore')
  })
})
