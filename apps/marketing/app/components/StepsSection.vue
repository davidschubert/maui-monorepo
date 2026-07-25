<script setup lang="ts">
// Szene 3 — der Mentor reicht die Karte (§6.4): drei Schritte, die Tür öffnet
// sich. Hoffnung/Erleichterung, der Ton klart auf (tone-sky).
const { t, tm, rt } = useI18n()
const items = computed(() =>
  (tm('marketing.steps.items') as Array<{ n: unknown, title: unknown, text: unknown }>).map(s => ({
    n: rt(s.n as string),
    title: rt(s.title as string),
    text: rt(s.text as string),
  })),
)
</script>

<template>
  <section id="so-gehts" class="mkt-section tone-sky">
    <div class="mkt-inner mkt-narrow steps-head" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.steps.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.steps.title') }}</h2>
      <span class="steps-badge">
        <UIcon name="i-ph-timer-bold" /> {{ t('marketing.steps.badge') }}
      </span>
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
.steps-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.5rem;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  background: hsl(var(--puka-sun) / 0.2);
  color: hsl(var(--puka-sun-deep));
  font-weight: 700;
  font-size: 0.85rem;
}
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
