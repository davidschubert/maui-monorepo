<script setup lang="ts">
// Szene 11 — die Schwelle (§6.4): schmerzlos, Free-Start. P4-Pricing
// (Davids Entscheid 2026-07-26): Basic 0 € / Personal 29 € / Pro 149 € /
// Enterprise individuell (Pukalani Studio), jährlich −25 %. Die Zahlen sind
// ECHT (Stripe-Katalog, ensure-prices) — der frühere Platzhalter-Zustand
// („Zahlen folgen") ist damit Geschichte. Ton: warmes Morgenlicht (dawn).
const { t, n } = useI18n()
const { start, signIn } = useProductLinks()

const yearly = ref(false)

// Cent-Beträge = Stripe-Katalog (scripts/stripe/ensure-prices.mjs).
// yearlyMonthly = Jahrespreis / 12 (exakt −25 %), Anzeige pro Monat.
//
// BRUTTO (Davids Entscheid 2026-07-29, OPEN-ITEMS A3): die Beträge sind
// Endpreise inkl. 19 % MwSt. Das Publikum ist gemischt (Zielgruppenseite
// /fuer/vereine — Vereine sind oft keine Unternehmer), und gegenüber
// Verbrauchern verlangt die PAngV den Gesamtpreis inklusive Umsatzsteuer.
// Der Hinweis steht deshalb AM Preis (vatNote), nicht im Fußzeilen-Kleingedruckten,
// und gilt für beide Intervalle (monatlich wie jährlich).
const PRICES = { personal: { monthly: 2900, yearly: 26100 }, pro: { monthly: 14900, yearly: 134100 } } as const

function perMonth(key: keyof typeof PRICES): number {
  return yearly.value ? PRICES[key].yearly / 12 / 100 : PRICES[key].monthly / 100
}

const plans = computed(() => [
  { key: 'basic', price: t('marketing.pricing.freePrice'), note: t('marketing.pricing.freeNote'), vat: false, to: start, featured: false },
  { key: 'personal', price: n(perMonth('personal'), { style: 'currency', currency: 'EUR' }), note: yearly.value ? t('marketing.pricing.perMonthYearly') : t('marketing.pricing.perMonth'), vat: true, to: signIn, featured: true },
  { key: 'pro', price: n(perMonth('pro'), { style: 'currency', currency: 'EUR' }), note: yearly.value ? t('marketing.pricing.perMonthYearly') : t('marketing.pricing.perMonth'), vat: true, to: signIn, featured: false },
  { key: 'enterprise', price: t('marketing.pricing.enterprisePrice'), note: t('marketing.pricing.enterpriseNote'), vat: false, to: signIn, featured: false },
].map(plan => ({
  ...plan,
  name: t(`marketing.pricing.plans.${plan.key}.name`),
  tag: t(`marketing.pricing.plans.${plan.key}.tag`),
  desc: t(`marketing.pricing.plans.${plan.key}.desc`),
  cta: t(`marketing.pricing.plans.${plan.key}.cta`),
})))
</script>

<template>
  <section id="preise" class="mkt-section tone-dawn-hold">
    <div class="mkt-inner mkt-narrow pricing-head" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.pricing.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.pricing.title') }}</h2>
      <p class="mkt-lead">{{ t('marketing.pricing.lead') }}</p>
      <div class="pricing-toggle" role="group" :aria-label="t('marketing.pricing.intervalLabel')">
        <button type="button" :class="{ active: !yearly }" @click="yearly = false">{{ t('marketing.pricing.monthly') }}</button>
        <button type="button" :class="{ active: yearly }" @click="yearly = true">
          {{ t('marketing.pricing.yearly') }} <span class="pricing-off">−25 %</span>
        </button>
      </div>
    </div>

    <div class="pricing-grid mkt-inner" data-reveal>
      <div
        v-for="plan in plans" :key="plan.key"
        class="plan-card" :class="{ 'plan-featured': plan.featured }"
      >
        <p class="plan-tag">{{ plan.tag }}</p>
        <h3 class="plan-name">{{ plan.name }}</h3>
        <p class="plan-price">
          {{ plan.price }}
          <span class="plan-price-note">{{ plan.note }}</span>
          <span v-if="plan.vat" class="plan-price-vat">{{ t('marketing.pricing.vatNote') }}</span>
        </p>
        <p class="plan-desc">{{ plan.desc }}</p>
        <UButton
          :to="plan.to"
          :color="plan.featured ? 'warning' : 'neutral'"
          :variant="plan.featured ? 'solid' : 'soft'"
          block class="plan-cta"
        >{{ plan.cta }}</UButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pricing-head { text-align: center; }
.pricing-head .mkt-lead { margin-inline: auto; }
.pricing-toggle {
  display: inline-flex;
  margin-top: 1rem;
  border: 1px solid hsl(var(--puka-ink) / 0.12);
  border-radius: 999px;
  padding: 0.25rem;
  gap: 0.25rem;
  background: hsl(0 0% 100% / 0.6);
}
.pricing-toggle button {
  border: 0;
  background: transparent;
  border-radius: 999px;
  padding: 0.4rem 1rem;
  font-weight: 700;
  font-size: 0.9rem;
  color: hsl(var(--puka-ink-soft));
  cursor: pointer;
}
.pricing-toggle button.active {
  background: hsl(var(--puka-sun) / 0.25);
  color: hsl(var(--puka-ink));
}
.pricing-off { color: hsl(var(--puka-sun-deep)); }
.pricing-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
  margin-top: 2.5rem;
}
.plan-card {
  background: hsl(0 0% 100% / 0.7);
  border: 1px solid hsl(var(--puka-ink) / 0.08);
  border-radius: 1.1rem;
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
}
.plan-featured {
  border-color: hsl(var(--puka-sun));
  box-shadow: 0 20px 50px -24px hsl(var(--puka-sun-deep) / 0.6);
}
.plan-tag {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: hsl(var(--puka-sun-deep));
  min-height: 1rem;
}
.plan-name { font-size: 1.3rem; font-weight: 800; }
.plan-price { font-size: 1.6rem; font-weight: 800; margin: 0.5rem 0 0.25rem; color: hsl(var(--puka-ink)); }
.plan-price-note { display: block; font-size: 0.78rem; font-weight: 500; color: hsl(var(--puka-ink-soft) / 0.7); }
/* Pflichtangabe (PAngV): steht am Preis und bleibt lesbar — bewusst kräftiger
   als die Intervall-Zeile darüber, damit sie nicht als Kleingedrucktes wirkt. */
.plan-price-vat { display: block; font-size: 0.78rem; font-weight: 600; color: hsl(var(--puka-ink-soft)); }
.plan-desc { color: hsl(var(--puka-ink-soft)); line-height: 1.55; flex: 1; margin-bottom: 1.25rem; }

@media (min-width: 980px) { .pricing-grid { grid-template-columns: repeat(4, 1fr); } }
@media (min-width: 640px) and (max-width: 979px) { .pricing-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
