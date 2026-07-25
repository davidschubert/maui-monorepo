<script setup lang="ts">
// Szene 2 — der Gegenspieler tritt auf (§6.4): das „bewölkte Netz". Noch
// gedämpfter Ton (tone-mist), Frustration + Wiedererkennen, dann die Brücke
// zur Erleichterung.
const { t, tm, rt } = useI18n()
const rows = computed(() =>
  (tm('marketing.problem.rows') as Array<{ pain: unknown, gain: unknown }>).map(r => ({
    pain: rt(r.pain as string),
    gain: rt(r.gain as string),
  })),
)
</script>

<template>
  <section id="problem" class="mkt-section tone-mist">
    <div class="mkt-inner mkt-narrow" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.problem.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.problem.title') }}</h2>
      <p class="mkt-lead">{{ t('marketing.problem.lead') }}</p>
    </div>

    <div class="prob-grid mkt-inner" data-reveal>
      <div v-for="(row, i) in rows" :key="i" class="prob-card">
        <div class="prob-pain">
          <UIcon name="i-ph-cloud-fog-bold" class="prob-icon-pain" />
          <div>
            <span class="prob-label">{{ t('marketing.problem.painLabel') }}</span>
            <p>{{ row.pain }}</p>
          </div>
        </div>
        <UIcon name="i-ph-arrow-down-bold" class="prob-arrow" />
        <div class="prob-gain">
          <UIcon name="i-ph-sun-bold" class="prob-icon-gain" />
          <div>
            <span class="prob-label prob-label-gain">{{ t('marketing.problem.gainLabel') }}</span>
            <p>{{ row.gain }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.prob-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
  margin-top: 2.5rem;
}
.prob-card {
  background: hsl(0 0% 100% / 0.55);
  border: 1px solid hsl(var(--puka-ink) / 0.07);
  border-radius: 1rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.prob-pain, .prob-gain { display: flex; gap: 0.7rem; align-items: flex-start; }
.prob-label {
  display: block;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: hsl(var(--puka-ink-soft) / 0.7);
  margin-bottom: 0.15rem;
}
.prob-label-gain { color: hsl(var(--puka-sun-deep)); }
.prob-pain p { color: hsl(var(--puka-ink-soft)); }
.prob-gain p { color: hsl(var(--puka-ink)); font-weight: 600; }
.prob-icon-pain { color: hsl(var(--puka-ink-soft) / 0.55); width: 1.4rem; height: 1.4rem; flex: none; }
.prob-icon-gain { color: hsl(var(--puka-sun)); width: 1.4rem; height: 1.4rem; flex: none; }
.prob-arrow { color: hsl(var(--puka-ink) / 0.2); width: 1.1rem; height: 1.1rem; margin-left: 0.35rem; }

@media (min-width: 820px) {
  .prob-grid { grid-template-columns: repeat(3, 1fr); }
}
</style>
