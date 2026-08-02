import type { PukalaniBillingPlan } from './types/billing'

/**
 * WELCHE STRIPE-PREISE DARF DIESE INSTALLATION VERKAUFEN? (Audit 2026-08-02)
 *
 * Ausgangslage: `lookupKey` war ein freier Parameter der Checkout-Utilities
 * (`createSubscriptionCheckoutSession`, `createPaymentCheckoutSession`). Die
 * Garantie, dass dort nur ein gewollter Preis ankommt, lag ALLEIN beim
 * Aufrufer — bei den heutigen Aufrufern strukturell (Plan-Katalog bzw. die
 * `events`-Row), beim nächsten aber nicht mehr. Wer ein Body-Feld
 * durchreicht, kauft damit einen beliebigen aktiven Price des Stripe-Kontos.
 *
 * Deshalb prüft die Utility selbst — und zwar so streng, wie es die jeweilige
 * Sorte zulässt:
 *
 *  ABOS (mode 'subscription'): HARTE Allowlist. Ein Abo schaltet Produkte
 *  frei (`plan.products`), also muss der Preis aus `pukalani.billing.plans`
 *  stammen. Ein Key, den kein Plan nennt, hätte hinterher ohnehin
 *  `planId: 'unknown'` — das Abo liefe, ohne je etwas freizuschalten.
 *
 *  EINZELKÄUFE (mode 'payment'): hier gibt es keinen Katalog, den man
 *  vollständig kennen könnte — ein Event-Ticket verweist auf einen
 *  lookup_key, den der Betreiber in SEINEM Stripe-Konto anlegt und im
 *  Dashboard einträgt (Freitextfeld, `events.priceLookupKey`). Eine
 *  erschöpfende Liste wäre gelogen. Zwei Regeln greifen trotzdem:
 *   1. NIE ein Plan-Key. Ein Abo-Preis im Einmal-Checkout ist immer ein
 *      Fehler — entweder ein Tippfehler oder der Versuch, ein Abo als
 *      Einmalzahlung zu kaufen.
 *   2. `pukalani.billing.oneTimeLookupKeys`, wenn gesetzt: dann gilt genau
 *      diese Liste (Einträge exakt oder mit EINEM `*` am Ende als Präfix).
 *
 * Warum Regel 2 leer per Default AUFMACHT statt zuzumachen — die begründete
 * Ausnahme: paid-Events sind ein gebautes Produkt mit Freitext-Schlüsseln,
 * und keine Installation hat die Liste heute. Fail-closed hieße: jeder
 * bestehende Ticket-Verkauf antwortet nach dem Deploy 400. Die scharfe Kante
 * gegen Fremdpreise sitzt stattdessen in der Preis-SORTE (`price.type`, s.
 * `fulfillment.ts`), und wer es enger will, trägt die Liste ein.
 */

/** Alle lookup_keys, die ein deklarierter Plan beansprucht (beide Intervalle). */
export function planLookupKeys(plans: readonly PukalaniBillingPlan[]): string[] {
  const keys: string[] = []
  for (const plan of plans) {
    if (!plan.lookupKeys) continue
    keys.push(plan.lookupKeys.monthly, plan.lookupKeys.yearly)
  }
  return keys
}

/**
 * Passt der Key auf einen Allowlist-Eintrag? Exakt — oder als Präfix, wenn der
 * Eintrag mit genau EINEM `*` endet (`event_ticket_*`). Bewusst kein
 * allgemeines Glob/RegExp: ein `*` mitten im Muster (oder ein nacktes `*`)
 * lädt dazu ein, die Liste versehentlich wirkungslos zu machen.
 */
export function matchesLookupKeyPattern(key: string, pattern: string): boolean {
  if (!key || !pattern) return false
  if (!pattern.endsWith('*')) return key === pattern
  const prefix = pattern.slice(0, -1)
  // Ein nacktes '*' erlaubt alles — das ist keine Allowlist, sondern ihre
  // Abwesenheit. Wer das will, lässt die Liste weg.
  if (!prefix) return false
  return key.startsWith(prefix)
}

export function lookupKeyAllowedBy(key: string, patterns: readonly string[]): boolean {
  return patterns.some(pattern => matchesLookupKeyPattern(key, pattern))
}

/** Ergebnis der Prüfung — `null` = in Ordnung, sonst der fachliche Grund. */
export type LookupKeyRejection = 'unknown_plan' | 'plan_key_in_one_time_checkout' | 'not_purchasable'

/** Abo-Checkout: der Key MUSS ein deklarierter Plan-Key sein. */
export function rejectSubscriptionLookupKey(
  key: string,
  plans: readonly PukalaniBillingPlan[],
): LookupKeyRejection | null {
  return planLookupKeys(plans).includes(key) ? null : 'unknown_plan'
}

/** Einmal-Checkout: nie ein Plan-Key; und wenn eine Liste gesetzt ist, nur sie. */
export function rejectOneTimeLookupKey(
  key: string,
  plans: readonly PukalaniBillingPlan[],
  oneTimeLookupKeys: readonly string[] | undefined,
): LookupKeyRejection | null {
  if (planLookupKeys(plans).includes(key)) return 'plan_key_in_one_time_checkout'
  if (oneTimeLookupKeys && oneTimeLookupKeys.length > 0 && !lookupKeyAllowedBy(key, oneTimeLookupKeys)) {
    return 'not_purchasable'
  }
  return null
}
