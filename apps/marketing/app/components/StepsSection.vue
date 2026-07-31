<script setup lang="ts">
// Szene 3 — der Mentor reicht die Karte (§6.4): drei Schritte, die Tür öffnet
// sich. Hoffnung/Erleichterung, der Ton klart auf (tone-sky).
const { t } = useI18n()
const items = computed(() =>
  [0, 1, 2].map(i => ({
    n: t(`marketing.steps.items.${i}.n`),
    title: t(`marketing.steps.items.${i}.title`),
    text: t(`marketing.steps.items.${i}.text`),
  })),
)
</script>

<template>
  <section id="so-gehts" class="mkt-section tone-sky">
    <div class="mkt-inner mkt-narrow steps-head" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.steps.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.steps.title') }}</h2>
      <UBadge
        color="primary" variant="subtle" size="lg"
        icon="i-ph-timer-bold"
        class="mt-2 rounded-full px-3.5 py-1.5 font-bold"
        :label="t('marketing.steps.badge')"
      />
    </div>

    <ol class="steps-grid mkt-inner" data-reveal>
      <li v-for="step in items" :key="step.n" class="step-card">
        <span class="step-num">{{ step.n }}</span>
        <h3 class="step-title">{{ step.title }}</h3>
        <p class="step-text">{{ step.text }}</p>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.steps-head { text-align: center; }
.steps-head .mkt-lead { margin-inline: auto; }
.steps-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
  margin-top: 2.5rem;
  padding: 0;
  list-style: none;
  counter-reset: none;
}
.step-card {
  position: relative;
  background: hsl(0 0% 100% / 0.6);
  border: 1px solid hsl(var(--puka-ink) / 0.07);
  border-radius: 1rem;
  padding: 1.5rem;
}
.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 50%;
  font-weight: 800;
  font-size: 1.1rem;
  color: hsl(0 0% 100%);
  background: linear-gradient(135deg, hsl(var(--puka-sun)), hsl(var(--puka-sun-deep)));
  margin-bottom: 0.9rem;
}
.step-title { font-size: 1.15rem; font-weight: 700; margin-bottom: 0.35rem; }
.step-text { color: hsl(var(--puka-ink-soft)); line-height: 1.55; }

@media (min-width: 820px) {
  .steps-grid { grid-template-columns: repeat(3, 1fr); }
}
</style>
