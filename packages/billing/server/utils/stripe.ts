import Stripe from 'stripe'
import type { H3Event } from 'h3'
import type { MauiBillingConfig } from '../../shared/types/billing'

/**
 * Stripe-Server-Fundament (B8/B10): lazy Singleton, Key aus runtimeConfig
 * (NUXT_STRIPE_SECRET_KEY, server-only). Fehlender Key → generischer 500 +
 * Server-Log (kein Boot-Crash, keine Details an Clients).
 */
let stripeSingleton: Stripe | null = null

export function useStripe(event: H3Event): Stripe {
  if (stripeSingleton) return stripeSingleton
  const key = useRuntimeConfig(event).stripeSecretKey
  if (!key) {
    console.error('[billing] NUXT_STRIPE_SECRET_KEY fehlt — Billing ist enabled, aber ohne Key nicht funktionsfähig.')
    throw createError({ status: 500, statusText: 'Payment provider not configured' })
  }
  stripeSingleton = new Stripe(key)
  return stripeSingleton
}

/** Stripe-Fehler → generische h3-Fehler (keine Provider-Details leaken) */
export function toStripeSafeError(error: unknown, log: string): never {
  console.error(`[billing] ${log}:`, error)
  throw createError({ status: 502, statusText: 'Payment provider unavailable' })
}

/** Config-Gate: maui.billing (deep-merged) — 404 solange nicht aktiviert */
export async function requireBillingEnabled(event: H3Event): Promise<MauiBillingConfig> {
  const config = await getBillingConfig(event)
  if (!config.enabled) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  return config
}

export async function getBillingConfig(_event: H3Event): Promise<MauiBillingConfig> {
  // app.config ist build-time gemergt — im Nitro-Kontext ohne Event abrufbar
  const appConfig = useAppConfig() as { maui?: { billing?: Partial<MauiBillingConfig> } }
  const billing = appConfig.maui?.billing
  return {
    enabled: billing?.enabled ?? false,
    currency: billing?.currency ?? 'eur',
    trialDays: billing?.trialDays ?? 0,
    plans: billing?.plans ?? [],
  }
}

/**
 * lookup_key → Stripe-Price, in-memory gecacht (TTL 5 min) — B2: Prices leben
 * im Stripe-Dashboard, der Layer referenziert nur stabile lookup_keys.
 */
const PRICE_TTL_MS = 5 * 60_000
const priceCache = new Map<string, { at: number, price: Stripe.Price }>()

export async function resolvePriceByLookupKey(event: H3Event, lookupKey: string): Promise<Stripe.Price> {
  const cached = priceCache.get(lookupKey)
  if (cached && Date.now() - cached.at < PRICE_TTL_MS) return cached.price

  const stripe = useStripe(event)
  const res = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
    .catch(error => toStripeSafeError(error, `prices.list für lookup_key '${lookupKey}' fehlgeschlagen`))
  const price = res.data[0]
  if (!price) {
    console.error(`[billing] Kein aktiver Stripe-Price mit lookup_key '${lookupKey}' — im Dashboard anlegen.`)
    throw createError({ status: 500, statusText: 'Payment provider not configured' })
  }
  priceCache.set(lookupKey, { at: Date.now(), price })
  return price
}
