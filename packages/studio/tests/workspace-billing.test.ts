import { describe, expect, it } from 'vitest'
import { closeOverRequires, isPaidPlanKey, pickLookupKey, planToGrants, shouldApplyFreeFallback, subscriptionUpdateToAction } from '../shared/workspaceBilling'
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

describe('isPaidPlanKey (Doppelabo-Guard)', () => {
  it('bezahlter Plan (hat lookupKey) → true', () => {
    expect(isPaidPlanKey('pro', PLANS)).toBe(true)
  })
  it('free (lookupKey null) → false', () => {
    expect(isPaidPlanKey('free', PLANS)).toBe(false)
  })
  it('leer/unbekannt → false (kein Guard-Fehlalarm)', () => {
    expect(isPaidPlanKey(undefined, PLANS)).toBe(false)
    expect(isPaidPlanKey(null, PLANS)).toBe(false)
    expect(isPaidPlanKey('gibtsnicht', PLANS)).toBe(false)
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
  // Update-Objekt aus dem billing-Layer (trägt immer die stripeSubscriptionId).
  const upd = (status: string, metadata: Record<string, string>, sub = 'sub_A') => ({ status, metadata, stripeSubscriptionId: sub })

  it('active/trialing wenden den Plan aus der Metadata an (mit Sub-Id)', () => {
    expect(subscriptionUpdateToAction(upd('active', meta()), PLANS))
      .toEqual({ kind: 'apply-plan', workspaceId: 'ws-1', plan: 'pro', stripeSubscriptionId: 'sub_A' })
    expect(subscriptionUpdateToAction(upd('trialing', meta()), PLANS))
      .toEqual({ kind: 'apply-plan', workspaceId: 'ws-1', plan: 'pro', stripeSubscriptionId: 'sub_A' })
  })

  it('ohne workspaceId-Metadata wird ignoriert (fremdes Abo, z. B. Site-Billing)', () => {
    expect(subscriptionUpdateToAction(upd('active', { plan: 'pro' }), PLANS))
      .toEqual({ kind: 'ignore', reason: 'no-workspace-metadata' })
  })

  it('unbekannter/fehlender Plan wird ignoriert statt geraten', () => {
    expect(subscriptionUpdateToAction(upd('active', meta({ plan: 'enterprise' })), PLANS).kind).toBe('ignore')
    expect(subscriptionUpdateToAction(upd('active', { workspaceId: 'ws-1' }), PLANS).kind).toBe('ignore')
  })

  it('past_due/unpaid markieren nur den Status (Grants bleiben — Stripe-Dunning ist die Grace)', () => {
    expect(subscriptionUpdateToAction(upd('past_due', meta()), PLANS))
      .toEqual({ kind: 'past-due', workspaceId: 'ws-1' })
    expect(subscriptionUpdateToAction(upd('unpaid', meta()), PLANS))
      .toEqual({ kind: 'past-due', workspaceId: 'ws-1' })
  })

  it('canceled/incomplete_expired fallen aufs free-Set zurück (mit Sub-Id für den Guard)', () => {
    expect(subscriptionUpdateToAction(upd('canceled', meta()), PLANS))
      .toEqual({ kind: 'free-fallback', workspaceId: 'ws-1', stripeSubscriptionId: 'sub_A' })
    expect(subscriptionUpdateToAction(upd('incomplete_expired', meta()), PLANS))
      .toEqual({ kind: 'free-fallback', workspaceId: 'ws-1', stripeSubscriptionId: 'sub_A' })
  })

  it('incomplete/paused/Unbekanntes fasst nichts an', () => {
    expect(subscriptionUpdateToAction(upd('incomplete', meta()), PLANS).kind).toBe('ignore')
    expect(subscriptionUpdateToAction(upd('paused', meta()), PLANS).kind).toBe('ignore')
  })
})

describe('shouldApplyFreeFallback (Cross-Sub-Guard #6)', () => {
  it('degradiert, wenn die gekündigte Sub die hinterlegte ist', () => {
    expect(shouldApplyFreeFallback('sub_A', 'sub_A')).toBe(true)
  })
  it('degradiert bei leerem gespeicherten Wert (Legacy-Row / vor studio-009)', () => {
    expect(shouldApplyFreeFallback('', 'sub_A')).toBe(true)
  })
  it('degradiert NICHT, wenn eine ANDERE (neuere) Sub hinterlegt ist', () => {
    // Kern des Bugs: altes Abo sub_A wird gekündigt, aber sub_B stuft schon hoch.
    expect(shouldApplyFreeFallback('sub_B', 'sub_A')).toBe(false)
  })
})
