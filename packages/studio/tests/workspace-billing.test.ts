import { describe, expect, it } from 'vitest'
import { closeOverRequires, planToGrants, subscriptionEventToWorkspacePatch } from '../shared/workspaceBilling'
import type { StudioPlanCatalog } from '../shared/types/workspace'

const CATALOG = [
  { key: 'comments', requires: ['moderation'] },
  { key: 'moderation', requires: [] },
  { key: 'posts', requires: ['moderation'] },
  { key: 'events', requires: [] },
  { key: 'activity', requires: [] },
]

const PLANS: StudioPlanCatalog = {
  free: { stripePriceId: null, features: ['comments'] },
  pro: { stripePriceId: 'price_pro', features: ['comments', 'posts', 'events'] },
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

describe('subscriptionEventToWorkspacePatch', () => {
  it('active setzt Plan + Status', () => {
    expect(subscriptionEventToWorkspacePatch({ type: 'subscription.active', plan: 'pro' }))
      .toEqual({ plan: 'pro', status: 'active' })
  })

  it('active ohne plan-Metadata ist ein Fehler', () => {
    expect(() => subscriptionEventToWorkspacePatch({ type: 'subscription.active' }))
      .toThrow(/ohne plan-Metadata/)
  })

  it('past_due ändert nur den Status (Entitlements bleiben)', () => {
    expect(subscriptionEventToWorkspacePatch({ type: 'subscription.past_due' }))
      .toEqual({ status: 'past_due' })
  })

  it('canceled läuft über validUntil/graceUntil aus statt sofort zu löschen', () => {
    const patch = subscriptionEventToWorkspacePatch(
      { type: 'subscription.canceled', currentPeriodEnd: '2026-08-01T00:00:00.000Z' },
      { graceDays: 7 },
    )
    expect(patch.status).toBe('canceled')
    expect(patch.validUntil).toBe('2026-08-01T00:00:00.000Z')
    expect(patch.graceUntil).toBe('2026-08-08T00:00:00.000Z')
  })

  it('canceled ohne/mit kaputtem Periodenende ist ein Fehler', () => {
    expect(() => subscriptionEventToWorkspacePatch({ type: 'subscription.canceled' }))
      .toThrow(/ohne currentPeriodEnd/)
    expect(() => subscriptionEventToWorkspacePatch({ type: 'subscription.canceled', currentPeriodEnd: 'nope' }))
      .toThrow(/Ungültiges currentPeriodEnd/)
  })
})
