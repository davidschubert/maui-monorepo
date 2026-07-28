#!/usr/bin/env node
/**
 * Stripe Products/Prices idempotent anlegen — für den Go-Live-Runbook
 * (docs/runbooks/STRIPE-GO-LIVE-RUNBOOK.md §3). Legt genau die `lookup_key`s an,
 * die der Code erwartet (maui.studio.plans, Monats- + Jahres-Intervall).
 *
 * NUTZUNG (David, mit dem eigenen Key — Test ODER Live):
 *   STRIPE_KEY=sk_test_…  node scripts/stripe/ensure-prices.mjs          # Vorschau
 *   STRIPE_KEY=sk_test_…  node scripts/stripe/ensure-prices.mjs --apply  # anlegen
 *   STRIPE_KEY=sk_live_…  node scripts/stripe/ensure-prices.mjs --apply  # Live
 *
 * Idempotent: existiert ein Price mit dem lookup_key UND dem richtigen
 * Betrag, wird er übersprungen. Weicht der BETRAG ab (Preisänderung), wird
 * ein neuer Price angelegt und der lookup_key per transfer_lookup_key
 * umgezogen; der alte Price wird deaktiviert (Stripe-Preise sind immutabel —
 * Bestands-Abos behalten ihren alten Price, Neu-Checkouts bekommen den
 * neuen; genau so griff der P4-Rename 2026-07-26: 19 € → 29 € Personal).
 * Der Key bleibt in DEINER Shell — dieses Skript liest nur STRIPE_KEY.
 *
 * WICHTIG: Die lookup_key-Liste MUSS zu packages/control/app/app.config.ts
 * (maui.studio.plans) passen. Ändert sich der Katalog, hier nachziehen.
 */
import Stripe from 'stripe'

const CURRENCY = 'eur'

// Muss maui.studio.plans spiegeln. amount = Cent. Davids Pricing 2026-07-26:
// Personal 29 €/Monat, Pro (Teams) 149 €/Monat, jährlich exakt −25 %
// (29·12·0,75 = 261 €; 149·12·0,75 = 1341 €). Basic ist kostenlos (kein
// Price), Enterprise ist das Studio-Angebot (kein Self-Service-Checkout).
const PRODUCTS = [
  {
    key: 'workspace_personal',
    name: 'Pukalani Personal',
    prices: [
      { lookupKey: 'workspace_personal_monthly', interval: 'month', amount: 2900 },
      { lookupKey: 'workspace_personal_yearly', interval: 'year', amount: 26100 },
    ],
  },
  {
    key: 'workspace_pro',
    name: 'Pukalani Pro',
    prices: [
      { lookupKey: 'workspace_pro_monthly', interval: 'month', amount: 14900 },
      { lookupKey: 'workspace_pro_yearly', interval: 'year', amount: 134100 },
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

/** Price per lookup_key sicherstellen (idempotent, betrag-bewusst). */
async function ensurePrice(product, price) {
  const existing = await stripe.prices.list({ lookup_keys: [price.lookupKey], active: true, limit: 1 })
  const current = existing.data[0]
  if (current && current.unit_amount === price.amount && current.currency === CURRENCY) {
    console.log(`  = ${price.lookupKey} existiert bereits (${current.id}) — übersprungen`)
    return
  }
  if (current) {
    // Betrag-Drift (Preisänderung): Stripe-Preise sind immutabel — neuen
    // Price anlegen, lookup_key zieht per transfer_lookup_key um, alter
    // Price wird deaktiviert (Bestands-Abos behalten ihn intern).
    console.log(`  ~ ${price.lookupKey}: Betrag weicht ab (${current.unit_amount / 100} → ${price.amount / 100} ${CURRENCY}) — Key zieht um`)
    if (!apply) { console.log(`  · neuer Price würde angelegt, ${current.id} deaktiviert`); return }
  }
  else if (!apply) {
    console.log(`  · ${price.lookupKey} würde angelegt (${price.amount / 100} ${CURRENCY}/${price.interval})`)
    return
  }
  const created = await stripe.prices.create({
    product: product.id,
    currency: CURRENCY,
    unit_amount: price.amount,
    recurring: { interval: price.interval },
    lookup_key: price.lookupKey,
    transfer_lookup_key: true,
  })
  console.log(`  ✔ ${price.lookupKey} angelegt (${created.id}, ${price.amount / 100} ${CURRENCY}/${price.interval})`)
  if (current) {
    await stripe.prices.update(current.id, { active: false })
    console.log(`  ✔ Alt-Price ${current.id} deaktiviert`)
  }
}

for (const def of PRODUCTS) {
  console.log(`Produkt ${def.name}:`)
  const product = await ensureProduct(def)
  for (const price of def.prices) await ensurePrice(product, price)
  console.log('')
}
console.log(apply ? 'Fertig.' : 'Vorschau fertig — mit --apply anlegen.')
