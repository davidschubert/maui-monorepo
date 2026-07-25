<script setup lang="ts">
// Szene 14 — Denouement (§6.4): letzte Fäden, Ruhe. Native <details> =
// tastatur-/screenreader-freundlich, kein JS, funktioniert mit reduced-motion.
// Ton zurück zur Ruhe (cloud).
const { t } = useI18n()
const items = computed(() =>
  [0, 1, 2, 3, 4, 5].map(i => ({
    q: t(`marketing.faq.items.${i}.q`),
    a: t(`marketing.faq.items.${i}.a`),
  })),
)
</script>

<template>
  <section id="faq" class="mkt-section tone-cloud">
    <div class="mkt-inner mkt-narrow faq-head" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.faq.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.faq.title') }}</h2>
    </div>

    <div class="faq-list mkt-inner mkt-narrow" data-reveal>
      <details v-for="item in items" :key="item.q" class="faq-item">
        <summary class="faq-q">
          <span>{{ item.q }}</span>
          <UIcon name="i-ph-plus-bold" class="faq-plus" />
        </summary>
        <p class="faq-a">{{ item.a }}</p>
      </details>
    </div>
  </section>
</template>

<style scoped>
.faq-head { text-align: center; }
.faq-list { margin-top: 2rem; display: flex; flex-direction: column; gap: 0.75rem; }
.faq-item {
  background: hsl(0 0% 100% / 0.6);
  border: 1px solid hsl(var(--puka-ink) / 0.07);
  border-radius: 0.9rem;
  padding: 0 1.25rem;
}
.faq-q {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.15rem 0;
  font-weight: 700;
  font-size: 1.05rem;
  cursor: pointer;
  list-style: none;
}
.faq-q::-webkit-details-marker { display: none; }
.faq-plus {
  flex: none;
  width: 1.2rem;
  height: 1.2rem;
  color: hsl(var(--puka-sun-deep));
  transition: transform 0.2s ease;
}
.faq-item[open] .faq-plus { transform: rotate(45deg); }
.faq-a {
  padding: 0 0 1.2rem;
  color: hsl(var(--puka-ink-soft));
  line-height: 1.6;
  max-width: 42rem;
}
@media (prefers-reduced-motion: reduce) { .faq-plus { transition: none; } }
</style>
