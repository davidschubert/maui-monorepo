<script setup lang="ts">
// Szene 7 — das Heiligtum ist echt (§6.4): Ruhe-Beat, Angst senken. Ehrlich,
// keine pauschalen Rechtsclaims (§4.7-Regel). Ton: aufgeklarter Himmel (sky).
const { t } = useI18n()
const points = computed(() =>
  [0, 1, 2, 3, 4].map(i => ({
    icon: t(`marketing.privacy.points.${i}.icon`),
    text: t(`marketing.privacy.points.${i}.text`),
  })),
)
</script>

<template>
  <section id="datenschutz" class="mkt-section tone-sky">
    <div class="mkt-inner priv-grid">
      <div class="priv-copy" data-reveal>
        <p class="mkt-kicker">{{ t('marketing.privacy.kicker') }}</p>
        <h2 class="mkt-h2">{{ t('marketing.privacy.title') }}</h2>
        <p class="mkt-lead">{{ t('marketing.privacy.lead') }}</p>
        <p class="priv-note">{{ t('marketing.privacy.note') }}</p>
      </div>

      <ul class="priv-list" data-reveal style="--reveal-delay: 100ms">
        <li v-for="point in points" :key="point.text" class="priv-item">
          <span class="priv-ic"><UIcon :name="point.icon" /></span>
          <span>{{ point.text }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.priv-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2.5rem;
  align-items: center;
}
.priv-note {
  margin-top: 1rem;
  font-size: 0.9rem;
  color: hsl(var(--puka-ink-soft) / 0.8);
  border-left: 3px solid hsl(var(--puka-sun) / 0.6);
  padding-left: 0.85rem;
  max-width: 34rem;
}
.priv-list {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0;
  margin: 0;
  list-style: none;
}
.priv-item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.9rem 1.1rem;
  background: hsl(0 0% 100% / 0.6);
  border: 1px solid hsl(var(--puka-ink) / 0.06);
  border-radius: 0.8rem;
  font-weight: 600;
  color: hsl(var(--puka-ink));
}
.priv-ic {
  display: inline-flex;
  width: 2.1rem;
  height: 2.1rem;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 0.6rem;
  background: hsl(var(--puka-sun) / 0.18);
  color: hsl(var(--puka-sun-deep));
}
.priv-ic :deep(svg) { width: 1.2rem; height: 1.2rem; }

@media (min-width: 860px) { .priv-grid { grid-template-columns: 1fr 1fr; } }
</style>
