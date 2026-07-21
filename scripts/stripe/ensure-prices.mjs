#!/usr/bin/env node
/**
 * Stripe Products/Prices idempotent anlegen — für den Go-Live-Runbook
 * (docs/plans/STRIPE-GO-LIVE-RUNBOOK.md §3). Legt genau die `lookup_key`s an,
 * die der Code erwartet (maui.studio.plans, Monats- + Jahres-Intervall).
 *
 * NUTZUNG (David, mit dem eigenen Key — Test ODER Live):
 *   STRIPE_KEY=sk_test_…  node scripts/stripe/ensure-prices.mjs          # Vorschau
 *   STRIPE_KEY=sk_test_…  node scripts/stripe/ensure-prices.mjs --apply  # anlegen
 *   STRIPE_KEY=sk_live_…  node scripts/stripe/ensure-prices.mjs --apply  # Live
 *
 * Idempotent: existiert ein Price mit dem lookup_key schon (aktiv), wird er
 * übersprungen. Der Key bleibt in DEINER Shell — dieses Skript liest nur STRIPE_KEY.
 * Beträge unten sind PLATZHALTER — vor dem Live-Lauf auf echte Preise setzen.
 *
 * WICHTIG: Die lookup_key-Liste MUSS zu packages/studio/app/app.config.ts
 * (maui.studio.plans) passen. Ändert sich der Katalog, hier nachziehen.
 */
import Stripe from 'stripe'

const CURRENCY = 'eur'

// Muss maui.studio.plans spiegeln. amount = Cent (1900 = 19,00 €). PLATZHALTER!
const PRODUCTS = [
  {
    key: 'workspace_pro',
    name: 'Maui Workspace Pro',
    prices: [
      { lookupKey: 'workspace_pro_monthly', interval: 'month', amount: 1900 },
      { lookupKey: 'workspace_pro_yearly', interval: 'year', amount: 19000 },
    ],
  },
  {
    key: 'workspace_business',
    name: 'Maui Workspace Business',
    prices: [
      { lookupKey: 'workspace_business_monthly', interval: 'month', amount: 4900 },
      { lookupKey: 'workspace_business_yearly', interval: 'year', amount: 49000 },
    ],
  },
]

const key = process.env.STRIPE_KEY
if (!key) {
  console.error('✗ STRIPE_KEY fehlt. Aufruf: STRIPE_KEY=sk_test_… node scripts/stripe/ensure-prices.mjs [--apply]')
  process.exit(1)
}
const apply = process.argv.includes('--apply')
const mode = key.startsWith('sk_live_') ? 'LIVE' : 'TEST'
const stripe = new Stripe(key)

console.log(`Stripe ensure-prices — Modus ${mode}${apply ? ' (ANLEGEN)' : ' (Vorschau, --apply zum Anlegen)'}\n`)

/** Produkt per stabilem metadata.key finden oder anlegen (idempotent). */
async function ensureProduct(def) {
  const found = await stripe.products.search({ query: `metadata['maui_key']:'${def.key}'` })
  if (found.data[0]) return found.data[0]
  if (!apply) { console.log(`  · Produkt "${def.name}" würde angelegt`); return { id: `(neu:${def.key})` } }
  const product = await stripe.products.create({ name: def.name, metadata: { maui_key: def.key } })
  console.log(`  ✔ Produkt "${def.name}" angelegt (${product.id})`)
  return product
}

/** Price per lookup_key sicherstellen (idempotent). */
async function ensurePrice(product, price) {
  const existing = await stripe.prices.list({ lookup_keys: [price.lookupKey], active: true, limit: 1 })
  if (existing.data[0]) {
    console.log(`  = ${price.lookupKey} existiert bereits (${existing.data[0].id}) — übersprungen`)
    return
  }
  if (!apply) { console.log(`  · ${price.lookupKey} würde angelegt (${price.amount / 100} ${CURRENCY}/${price.interval})`); return }
  const created = await stripe.prices.create({
    product: product.id,
    currency: CURRENCY,
    unit_amount: price.amount,
    recurring: { interval: price.interval },
    lookup_key: price.lookupKey,
    transfer_lookup_key: true,
  })
  console.log(`  ✔ ${price.lookupKey} angelegt (${created.id}, ${price.amount / 100} ${CURRENCY}/${price.interval})`)
}

for (const def of PRODUCTS) {
  console.log(`Produkt ${def.name}:`)
  const product = await ensureProduct(def)
  for (const price of def.prices) await ensurePrice(product, price)
  console.log('')
}
console.log(apply ? 'Fertig.' : 'Vorschau fertig — mit --apply anlegen.')
