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
  /** interner Plan-Key aus maui.billing.plans */
  planId: string
  /** konkreter Stripe-Price (Audit/Debug) */
  priceId: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  trialEnd: string | null
  /** B4 Stale-Guard: Unix-Timestamp des jüngsten verarbeiteten Stripe-Events */
  lastStripeEventAt: number
}

/** Plan-Deklaration (maui.billing.plans) — free hat lookupKeys: null */
export interface MauiBillingPlan {
  id: string
  labelKey: string
  /** Entitlement-Features, z. B. 'courses.paid' — App-/Layer-Konvention */
  features: string[]
  highlight?: boolean
  /** Stripe-Price-Referenzen (§6: monatlich + jährlich); null = kein Stripe-Objekt (free) */
  lookupKeys: { monthly: string, yearly: string } | null
}

export interface MauiBillingConfig {
  enabled: boolean
  currency: string
  trialDays: number
  plans: MauiBillingPlan[]
}

/** Antwort von GET /api/billing/subscription (SSR-Hydration von useBilling) */
export interface BillingSubscriptionResponse {
  subscription: BillingSubscriptionRow | null
  /** aufgelöster Plan aus der Config (null = free/kein Abo) */
  planId: string | null
  features: string[]
  entitled: boolean
}
