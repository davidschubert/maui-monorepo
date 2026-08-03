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
      // Plan/Produkte bleiben — Stripe-Dunning ist die Grace-Periode; sichtbar
      // wird nur der `billingStatus` (+ `pastDueSince`). Auf DIESEM Stempel
      // arbeiten zwei Läufe im Pool: die Zahlungswarnung in die Glocke des
      // Owners (`scope: 'tenant'`, Davids Entscheidung vom 2026-08-03) und
      // 14 Tage später die Sperre. Der Webhook selbst meldet hier nichts — der
      // Owner ist ein Nutzer des RUNTIME-Projekts, das dieses Deployment nicht
      // erreicht.
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

// ── Zahlungsverzug → Sperre (M13, Davids Entscheidung vom 2026-08-02) ───────

/**
 * Wie lange darf eine offene Forderung offen bleiben, bevor die Community
 * nur-lesend wird? Vierzehn Tage — dieselbe Zahl wie die Testphase, und das ist
 * kein Zufall: beide sind „zwei Wochen, in denen nichts passiert". Stripes
 * eigenes Dunning (Zahlungsversuche + Mahn-Mails) läuft in dieser Zeit ohnehin.
 */
export const PAST_DUE_GRACE_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

/** Was die Sperr-Rechnung von einer Community wissen muss. */
export interface CommunityBillingState {
  /** `communities.status` — 'disabled' ist stillgelegt, da gibt es nichts zu sperren. */
  status: string
  /** `communities.billingStatus` — '' | 'active' | 'past_due' | 'canceled'. */
  billingStatus: string
  /** `communities.suspension` — '' | 'billing' | 'abuse'. */
  suspension: string
  /** `communities.pastDueSince` (ISO) oder null/''. */
  pastDueSince: string | null
}

/**
 * PURE (unit-getestet): Ist diese Community wegen Zahlungsverzugs zu sperren?
 *
 * Vier Bedingungen, jede aus einem eigenen Grund:
 *  - `status === 'active'` — eine stillgelegte Community ist schon offline.
 *  - `suspension === ''` — eine bestehende Sperre wird NIE überschrieben. Sonst
 *    stufte der Sweep eine `abuse`-Sperre stillschweigend auf „nur-lesend"
 *    herunter und brächte eine gesperrte Community zurück ins Netz.
 *  - `billingStatus === 'past_due'` — der Webhook normalisiert Stripes
 *    `past_due` UND `unpaid` auf genau diesen einen Wert; wer bezahlt hat oder
 *    gekündigt hat, steht hier nicht mehr.
 *  - die Frist ist abgelaufen, gerechnet ab `pastDueSince`.
 *
 * Ein unlesbares Datum sperrt NICHT (fail-open): lieber eine Mahnung zu spät
 * als eine Community zu Unrecht zugemacht.
 */
export function shouldSuspendForPastDue(community: CommunityBillingState, now: number): boolean {
  if (community.status !== 'active') return false
  if (community.suspension !== '') return false
  if (community.billingStatus !== 'past_due') return false
  if (!community.pastDueSince) return false
  const since = Date.parse(community.pastDueSince)
  if (!Number.isFinite(since)) return false
  return now - since >= PAST_DUE_GRACE_DAYS * DAY_MS
}

/**
 * PURE (unit-getestet): Ist eine BILLING-Sperre aufzuheben?
 *
 * „Zahlung ausgeglichen ⇒ Sperre fällt automatisch" (Davids Entscheidung). Der
 * Webhook macht das im selben Atemzug, in dem er `active` schreibt — diese
 * Funktion ist das NETZ darunter, für den Fall, dass ein Webhook einmal nicht
 * ankommt: der stündliche Sweep sieht dann eine Community mit
 * `suspension: 'billing'`, deren `billingStatus` längst nicht mehr `past_due`
 * ist, und macht sie wieder auf.
 *
 * Eine `abuse`-Sperre hebt hier NICHTS auf — die endet ausschließlich durch eine
 * Betreiber-Entscheidung.
 */
export function shouldLiftBillingSuspension(community: Pick<CommunityBillingState, 'billingStatus' | 'suspension'>): boolean {
  return community.suspension === 'billing' && community.billingStatus !== 'past_due'
}
