<script setup lang="ts">
// Szene 11 — die Schwelle (§6.4): schmerzlos, Free-Start. Ehrlich: Early Access
// auf Einladung, konkrete Zahlen folgen mit dem öffentlichen Start (§2.4 —
// keine erfundenen Preise). Ton: warmes Morgenlicht (dawn).
const { t } = useI18n()
const { start, signIn } = useProductLinks()
const plans = computed(() =>
  [0, 1, 2].map(i => ({
    name: t(`marketing.pricing.plans.${i}.name`),
    desc: t(`marketing.pricing.plans.${i}.desc`),
    cta: t(`marketing.pricing.plans.${i}.cta`),
    featured: i === 1,
  })),
)
</script>

<template>
  <section id="preise" class="mkt-section tone-dawn">
    <div class="mkt-inner mkt-narrow pricing-head" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.pricing.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.pricing.title') }}</h2>
      <p class="mkt-lead">{{ t('marketing.pricing.lead') }}</p>
      <span class="pricing-ea"><UIcon name="i-ph-seal-check-bold" /> {{ t('marketing.pricing.eaBadge') }}</span>
    </div>

    <div class="pricing-grid mkt-inner" data-reveal>
      <div
        v-for="plan in plans" :key="plan.name"
        class="plan-card" :class="{ 'plan-featured': plan.featured }"
      >
        <h3 class="plan-name">{{ plan.name }}</h3>
        <p class="plan-price">—<span class="plan-price-note">{{ t('marketing.pricing.numbersNote') }}</span></p>
        <p class="plan-desc">{{ plan.desc }}</p>
        <UButton
          :to="plan.name === 'Free' ? start : signIn"
          :color="plan.featured ? 'warning' : 'neutral'"
          :variant="plan.featured ? 'solid' : 'soft'"
          block class="plan-cta"
        >{{ plan.cta }}</UButton>
      </div>
    </div>

    <p class="pricing-silo mkt-inner" data-reveal>
      <UIcon name="i-ph-buildings-bold" /> {{ t('marketing.pricing.silo') }}
    </p>
  </section>
</template>

<style scoped>
.pricing-head { text-align: center; }
.pricing-head .mkt-lead { margin-inline: auto; }
.pricing-ea {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.75rem;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  background: hsl(var(--puka-sun) / 0.2);
  color: hsl(var(--puka-sun-deep));
  font-weight: 700;
  font-size: 0.85rem;
}
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
.plan-name { font-size: 1.3rem; font-weight: 800; }
.plan-price { font-size: 1.6rem; font-weight: 800; margin: 0.5rem 0 0.25rem; color: hsl(var(--puka-ink)); }
.plan-price-note { display: block; font-size: 0.78rem; font-weight: 500; color: hsl(var(--puka-ink-soft) / 0.7); }
.plan-desc { color: hsl(var(--puka-ink-soft)); line-height: 1.55; flex: 1; margin-bottom: 1.25rem; }
.pricing-silo {
  margin-top: 1.5rem;
  text-align: center;
  color: hsl(var(--puka-ink-soft));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

@media (min-width: 820px) { .pricing-grid { grid-template-columns: repeat(3, 1fr); } }
</style>
