import type { Models } from 'node-appwrite'

export const BILLING_CUSTOMERS_TABLE = 'billing_customers'
export const BILLING_SUBSCRIPTIONS_TABLE = 'billing_subscriptions'

/** Stripe-Statusraum 1:1 (B3) */
export const SUBSCRIPTION_STATUSES = [
  'active', 'trialing', 'past_due', 'canceled',
  'incomplete', 'incomplete_expired', 'unpaid', 'paused',
] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

/**
 * „Aktives Entitlement" — §6-Entscheidung (2026-07-08): past_due behält
 * Zugriff, solange Stripe-Dunning läuft (canceled/unpaid beendet ihn).
 */
export const ENTITLED_STATUSES: readonly SubscriptionStatus[] = ['active', 'trialing', 'past_due']

export type BillingInterval = 'monthly' | 'yearly'
export const BILLING_INTERVALS: readonly BillingInterval[] = ['monthly', 'yearly']

export interface BillingCustomerRow extends Models.Row {
  userId: string
  stripeCustomerId: string
  email: string
}

export interface BillingSubscriptionRow extends Models.Row {
  userId: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  status: SubscriptionStatus
  /** interner Plan-Key aus pukalani.billing.plans */
  planId: string
  /** konkreter Stripe-Price (Audit/Debug) */
  priceId: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  trialEnd: string | null
  /** B4 Stale-Guard: Unix-Timestamp des jüngsten verarbeiteten Stripe-Events */
  lastStripeEventAt: number
}

/**
 * Eine Abo-Zeile für die BETREIBER-Übersicht (Audit-Befund C12): dieselbe Row,
 * zusätzlich mit dem Anzeigenamen des Kontos. Die rohe `userId` war dort die
 * einzige Auskunft über „wer" — eine 20-stellige Appwrite-Id sagt niemandem
 * etwas. Beide Felder sind BEST EFFORT: fehlt dem Runtime-Key der users-Scope
 * oder ist das Konto gelöscht, bleiben sie leer und die UI fällt auf die Id
 * zurück (die bleibt als Nachschlage-Schlüssel sichtbar).
 */
export interface BillingAdminSubscriptionRow extends BillingSubscriptionRow {
  userName: string
  userEmail: string
}

/** Plan-Deklaration (pukalani.billing.plans) — free hat lookupKeys: null */
export interface PukalaniBillingPlan {
  id: string
  labelKey: string
  /** Entitlement-Produkte, z. B. 'courses.paid' — App-/Layer-Konvention */
  products: string[]
  /**
   * Anzeige-Stichpunkte der Pricing-Karte (i18n-Keys unter billing.products.*).
   * Reines Marketing — getrennt von den Entitlement-products; fehlt das Feld,
   * zeigt die Karte die products an.
   */
  highlights?: string[]
  highlight?: boolean
  /** Stripe-Price-Referenzen (§6: monatlich + jährlich); null = kein Stripe-Objekt (free) */
  lookupKeys: { monthly: string, yearly: string } | null
}

/**
 * Zelle der Vergleichstabelle: true → Haken, false → nicht enthalten,
 * String → i18n-Key für einen Text-Zustand (z. B. „Eingeschränkt").
 */
export type BillingCompareValue = boolean | string

export interface PukalaniBillingCompareRow {
  labelKey: string
  /** Wert je Plan-Id (fehlender Eintrag = false) */
  plans: Record<string, BillingCompareValue>
}

export interface PukalaniBillingCompareSection {
  labelKey: string
  rows: PukalaniBillingCompareRow[]
}

export interface PukalaniBillingConfig {
  enabled: boolean
  currency: string
  trialDays: number
  plans: PukalaniBillingPlan[]
  /**
   * Zusätzlich kaufbare lookup_keys für EINMAL-Käufe (Event-Tickets & Co.) —
   * exakt oder mit EINEM `*` am Ende als Präfix (`event_ticket_*`).
   *
   * Fehlt/leer, gilt für Einmal-Käufe nur die Grundregel „kein Plan-Key + der
   * Stripe-Price muss `one_time` sein" (shared/lookupKeys.ts). Wer die Menge
   * der verkaufbaren Preise fest umreißen will, trägt sie hier ein — Abo-Preise
   * sind davon unberührt, die kommen ausschließlich aus `plans`.
   */
  oneTimeLookupKeys?: string[]
  /** Optionale „Alle Funktionen im Vergleich"-Tabelle der Pricing-Seite */
  compare?: { sections: PukalaniBillingCompareSection[] }
}

/** Antwort von GET /api/billing/prices (öffentlich, für die Pricing-Seite) */
export interface BillingPricesResponse {
  /** je Plan-Id die Stripe-Beträge in Cent; null = Stripe (noch) nicht konfiguriert */
  prices: Record<string, Partial<Record<BillingInterval, { amount: number, currency: string }>>> | null
}

/** Antwort von GET /api/billing/subscription (SSR-Hydration von useBilling) */
export interface BillingSubscriptionResponse {
  subscription: BillingSubscriptionRow | null
  /** aufgelöster Plan aus der Config (null = free/kein Abo) */
  planId: string | null
  products: string[]
  entitled: boolean
}
