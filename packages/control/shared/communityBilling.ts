import type { ControlPlan, ControlPlanCatalog, PlanBillingInterval } from './types/planCatalog'

/**
 * A6 — die Community ist das zahlende Objekt (Davids Entscheidung 2026-07-30):
 * die PUREN Bausteine des Geldpfads. Kein Stripe, kein I/O — nur
 * verifiziertes Abo-Ereignis → Wirkung auf die Community-Row.
 *
 * Seit A6 Schritt 5 ist das der EINZIGE Geldpfad: `workspaceBilling.ts` ist
 * weg, `pickLookupKey` und `shouldApplyFreeFallback` sind von dort hierher
 * gezogen (sie hatten nie etwas mit dem Behälter zu tun, nur mit dem Abo).
 *
 * Der Plan-Katalog ist DERSELBE wie bisher (pukalani.control.plans,
 * basic/personal/pro mit Stripe-lookup_keys) — er beschrieb schon immer die
 * Community-Preise (P4: Personal 29 €, Pro 149 €); nur sein Rechnungs-
 * Behälter war der Workspace.
 *
 * Kündigungs-Timing macht STRIPE selbst (cancel_at_period_end → 'canceled'
 * erst zum echten Ende); danach fällt die Community auf 'basic' zurück — NIE
 * auf nichts (ein gekündigter Kunde ist nie schlechter gestellt als einer,
 * der nie gezahlt hat).
 */

/** Vom billing-Layer bereits VERIFIZIERTES Abo-Update — strukturell statt
 *  Import des billing-Typs: control kennt billing nicht (A14), die APP
 *  komponiert beide (Fulfillment-Plugin). */
export interface CommunitySubscriptionUpdate {
  /** Stripe-Statusraum (billing B3): active/trialing/past_due/canceled/… */
  status: string
  /** subscription_data.metadata aus dem Community-Checkout. */
  metadata: Record<string, string>
  stripeCustomerId: string
  stripeSubscriptionId: string
}

export type CommunityBillingAction =
  | { kind: 'ignore', reason: string }
  | { kind: 'apply-plan', communityId: string, plan: string, stripeCustomerId: string, stripeSubscriptionId: string }
  | { kind: 'past-due', communityId: string }
  | { kind: 'free-fallback', communityId: string, stripeSubscriptionId: string }

/** Entscheidung des Fulfillment-Handlers — pure, damit die Policy ohne
 *  Stripe/Appwrite testbar ist. Schlüssel ist `metadata.communityId`
 *  (= tenants.$id); Events ohne sie sind fremd und werden ignoriert. */
export function subscriptionUpdateToCommunityAction(
  update: CommunitySubscriptionUpdate,
  plans: ControlPlanCatalog,
): CommunityBillingAction {
  const communityId = update.metadata.communityId
  if (!communityId) return { kind: 'ignore', reason: 'no-community-metadata' }

  switch (update.status) {
    case 'active':
    case 'trialing': {
      const plan = update.metadata.plan
      if (!plan || !plans[plan]) return { kind: 'ignore', reason: `unknown-plan-${plan ?? 'missing'}` }
      return {
        kind: 'apply-plan',
        communityId,
        plan,
        stripeCustomerId: update.stripeCustomerId,
        stripeSubscriptionId: update.stripeSubscriptionId,
      }
    }
    case 'past_due':
    case 'unpaid':
      // Plan/Produkte bleiben — Stripe-Dunning ist die Grace-Periode; nur der
      // billingStatus wird sichtbar (Zahlungswarnung, notify scope 'account').
      return { kind: 'past-due', communityId }
    case 'canceled':
    case 'incomplete_expired':
      return { kind: 'free-fallback', communityId, stripeSubscriptionId: update.stripeSubscriptionId }
    default:
      // incomplete (Checkout offen), paused, Unbekanntes → nichts anfassen
      return { kind: 'ignore', reason: `status-${update.status}` }
  }
}

/** Den passenden Stripe-lookup_key für Plan + Intervall wählen. Jahres-Preis
 *  optional: fehlt er, fällt 'yearly' bewusst auf den Monatspreis zurück (statt
 *  zu brechen). null = Plan ohne Checkout (basic). Pure → unit-testbar. */
export function pickLookupKey(plan: Pick<ControlPlan, 'lookupKey' | 'lookupKeyYearly'>, interval: PlanBillingInterval): string | null {
  if (interval === 'yearly') return plan.lookupKeyYearly ?? plan.lookupKey
  return plan.lookupKey
}

/**
 * Cross-Sub-Guard (#6): darf die gekündigte Subscription die Community auf
 * `basic` zurückstufen? NUR, wenn sie die aktuell hinterlegte ist — oder gar
 * keine hinterlegt ist. Ist eine ANDERE, neuere Sub hinterlegt, ist das
 * Kündigen der alten stale und darf ein frisch gekauftes Abo nicht
 * kannibalisieren. Pure → unit-testbar.
 */
export function shouldApplyFreeFallback(storedSubscriptionId: string, canceledSubscriptionId: string): boolean {
  return storedSubscriptionId === '' || storedSubscriptionId === canceledSubscriptionId
}

/**
 * Läuft an dieser Community gerade ein Abo?
 *
 * „Lebend" heißt: eine Subscription ist hinterlegt UND ihr Status ist weder
 * leer (nie eins gehabt) noch 'canceled'. `past_due` zählt bewusst DAZU —
 * offene Forderung ist ein laufender Vertrag, kein beendeter.
 *
 * Seit C16 (2026-07-31) hängen ZWEI Sperren daran (Übergabe und Löschen);
 * vorher stand die Rechnung inline in `transferBlockedBySubscription`. Zwei
 * Kopien derselben Frage wären zwei Stellen, an denen jemand `past_due`
 * vergisst.
 */
export function hasLiveSubscription(input: { billingStatus: string, stripeSubscriptionId: string }): boolean {
  return !!input.stripeSubscriptionId && input.billingStatus !== 'canceled' && input.billingStatus !== ''
}

/** Besitz-Übergabe gesperrt, solange ein Abo läuft und der NEUE Owner keine
 *  eigene Zahlungsmethode hinterlegt hat (Davids A6-Entscheidung 1). Pure —
 *  die Transfer-Route setzt sie durch, die UI erklärt sie. */
export function transferBlockedBySubscription(input: {
  billingStatus: string
  stripeSubscriptionId: string
  newOwnerHasPaymentMethod: boolean
}): boolean {
  return hasLiveSubscription(input) && !input.newOwnerHasPaymentMethod
}

/**
 * Community-Löschung gesperrt, solange ein Abo läuft (C16, 2026-07-31).
 *
 * Nicht aus Bosheit, sondern weil sonst weiterberechnet würde, was der Kunde
 * gerade abgeschaltet hat: die Community stillzulegen kündigt bei Stripe NICHTS.
 * Erst kündigen (Kundenportal), dann löschen — der Fehler sagt genau das, und
 * `data.code` trägt den Grund bis in die UI.
 */
export function deleteBlockedBySubscription(input: { billingStatus: string, stripeSubscriptionId: string }): boolean {
  return hasLiveSubscription(input)
}
