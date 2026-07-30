<script setup lang="ts">
// Szene 8 — der soziale Spiegel (§6.4): „Menschen wie du". Identifikation statt
// Feature-Liste; jede Karte führt auf ihre Anwendungsfall-Seite (Silo-SEO).
const { t } = useI18n()
const localePath = useLocalePath()

const items = computed(() =>
  [0, 1, 2, 3].map(i => ({
    slug: t(`marketing.audience.items.${i}.slug`),
    icon: t(`marketing.audience.items.${i}.icon`),
    title: t(`marketing.audience.items.${i}.title`),
    text: t(`marketing.audience.items.${i}.text`),
  })),
)
</script>

<template>
  <section id="fuer-wen" class="mkt-section tone-dawn-hold">
    <div class="mkt-inner mkt-narrow aud-head" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.audience.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.audience.title') }}</h2>
      <p class="mkt-lead">{{ t('marketing.audience.lead') }}</p>
    </div>

    <div class="aud-grid mkt-inner" data-reveal>
      <NuxtLink
        v-for="item in items" :key="item.slug"
        :to="localePath({ name: 'use-cases-slug', params: { slug: item.slug } })" class="aud-card"
      >
        <UIcon :name="item.icon" class="aud-icon" />
        <h3 class="aud-title">{{ item.title }}</h3>
        <p class="aud-text">{{ item.text }}</p>
        <span class="aud-more">{{ t('marketing.audience.more') }} <UIcon name="i-ph-arrow-right-bold" /></span>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.aud-head { text-align: center; }
.aud-head .mkt-lead { margin-inline: auto; }
.aud-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.1rem;
  margin-top: 2.5rem;
}
.aud-card {
  display: block;
  padding: 1.5rem;
  border-radius: 1rem;
  background: hsl(0 0% 100% / 0.65);
  border: 1px solid hsl(var(--puka-ink) / 0.08);
  text-decoration: none;
  color: inherit;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.aud-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 18px 40px -22px hsl(var(--puka-ink) / 0.45);
}
.aud-icon { width: 2rem; height: 2rem; color: hsl(var(--puka-sun-deep)); }
.aud-title { font-size: 1.15rem; font-weight: 800; margin: 0.75rem 0 0.35rem; }
.aud-text { color: hsl(var(--puka-ink-soft)); line-height: 1.55; }
.aud-more {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.9rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: hsl(var(--puka-sun-deep));
}
.aud-more :deep(svg) { width: 0.95rem; height: 0.95rem; }

@media (prefers-reduced-motion: reduce) {
  .aud-card, .aud-card:hover { transition: none; transform: none; }
}
@media (min-width: 640px) { .aud-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1060px) { .aud-grid { grid-template-columns: repeat(4, 1fr); } }
</style>
