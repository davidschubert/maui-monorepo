import { describe, expect, it } from 'vitest'
import { subscriptionUpdateToCommunityAction, transferBlockedBySubscription } from '../shared/communityBilling'
import type { ControlPlanCatalog } from '../shared/types/workspace'

/**
 * A6 — Community-Geldpfad-Policy (Gegenstück zu workspace-billing.test.ts).
 * Diese Tests sind das Netz, das a6-money-path.test.ts versprochen hat: ab
 * jetzt HAT ein communityId-Ereignis eine Wirkung — auf die Community.
 */

const plans: ControlPlanCatalog = {
  basic: { lookupKey: null, products: ['comments'] },
  personal: { lookupKey: 'workspace_personal_monthly', products: ['comments', 'posts'] },
  pro: { lookupKey: 'workspace_pro_monthly', products: ['comments', 'posts', 'events'] },
}

const base = { stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' }

describe('subscriptionUpdateToCommunityAction', () => {
  it('bezahltes Abo → apply-plan auf die Community (mit Customer + Sub für den Cross-Sub-Guard)', () => {
    const action = subscriptionUpdateToCommunityAction({
      status: 'active', metadata: { communityId: 't-1', plan: 'personal' }, ...base,
    }, plans)
    expect(action).toEqual({ kind: 'apply-plan', communityId: 't-1', plan: 'personal', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' })
  })

  it('trialing zählt wie active (Stripe-Trials sind bezahlpflichtige Abos)', () => {
    expect(subscriptionUpdateToCommunityAction({ status: 'trialing', metadata: { communityId: 't-1', plan: 'pro' }, ...base }, plans).kind).toBe('apply-plan')
  })

  it('ohne communityId-Metadata: ignorieren (fremdes oder Workspace-Ereignis)', () => {
    expect(subscriptionUpdateToCommunityAction({ status: 'active', metadata: { workspaceId: 'ws-1', plan: 'personal' }, ...base }, plans))
      .toEqual({ kind: 'ignore', reason: 'no-community-metadata' })
  })

  it('unbekannter oder fehlender Plan: ignorieren statt raten — ein Tippfehler darf nie ein Grant-Set produzieren', () => {
    expect(subscriptionUpdateToCommunityAction({ status: 'active', metadata: { communityId: 't-1', plan: 'gold' }, ...base }, plans))
      .toEqual({ kind: 'ignore', reason: 'unknown-plan-gold' })
    expect(subscriptionUpdateToCommunityAction({ status: 'active', metadata: { communityId: 't-1' }, ...base }, plans))
      .toEqual({ kind: 'ignore', reason: 'unknown-plan-missing' })
  })

  it('past_due/unpaid: Marker, Plan bleibt (Dunning ist die Grace-Periode)', () => {
    expect(subscriptionUpdateToCommunityAction({ status: 'past_due', metadata: { communityId: 't-1' }, ...base }, plans))
      .toEqual({ kind: 'past-due', communityId: 't-1' })
    expect(subscriptionUpdateToCommunityAction({ status: 'unpaid', metadata: { communityId: 't-1' }, ...base }, plans))
      .toEqual({ kind: 'past-due', communityId: 't-1' })
  })

  it('canceled/incomplete_expired: free-fallback mit der Sub fürs Cross-Sub-Guard', () => {
    expect(subscriptionUpdateToCommunityAction({ status: 'canceled', metadata: { communityId: 't-1' }, ...base }, plans))
      .toEqual({ kind: 'free-fallback', communityId: 't-1', stripeSubscriptionId: 'sub_1' })
  })

  it('incomplete/paused/Unbekanntes: nichts anfassen', () => {
    for (const status of ['incomplete', 'paused', 'somethingnew']) {
      expect(subscriptionUpdateToCommunityAction({ status, metadata: { communityId: 't-1' }, ...base }, plans).kind).toBe('ignore')
    }
  })
})

describe('transferBlockedBySubscription (A6-Entscheidung 1)', () => {
  it('laufendes Abo + neuer Owner ohne Zahlungsmethode → gesperrt', () => {
    expect(transferBlockedBySubscription({ billingStatus: 'active', stripeSubscriptionId: 'sub_1', newOwnerHasPaymentMethod: false })).toBe(true)
    expect(transferBlockedBySubscription({ billingStatus: 'past_due', stripeSubscriptionId: 'sub_1', newOwnerHasPaymentMethod: false })).toBe(true)
  })

  it('frei, wenn kein Abo läuft oder der neue Owner zahlen kann', () => {
    expect(transferBlockedBySubscription({ billingStatus: '', stripeSubscriptionId: '', newOwnerHasPaymentMethod: false })).toBe(false)
    expect(transferBlockedBySubscription({ billingStatus: 'canceled', stripeSubscriptionId: 'sub_1', newOwnerHasPaymentMethod: false })).toBe(false)
    expect(transferBlockedBySubscription({ billingStatus: 'active', stripeSubscriptionId: 'sub_1', newOwnerHasPaymentMethod: true })).toBe(false)
  })
})
