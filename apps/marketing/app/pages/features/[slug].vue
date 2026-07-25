<script setup lang="ts">
// Feature-Cluster-Seiten (§3.1): /features/diskussionen · /features/branding.
//
// BEWUSST NUR DIE BELEGTEN BAUSTEINE (§2.4): /features/kurse und
// /features/events fehlen absichtlich. Eine eigene Verkaufsseite für einen
// Early-Access-Baustein liest wie eine Live-Zusage — genau das verbietet die
// Copy-Regel („keine ‚Coming soon'-Karte darf wie ein aktueller
// Tarifbestandteil aussehen"). Sie kommen, sobald ihr Baustein-Gate grün ist;
// bis dahin sind Kurse/Events auf der Startseite als Early Access markiert.
definePageMeta({ layout: 'site' })

const SLUGS = ['diskussionen', 'branding'] as const
const route = useRoute()
const slug = String(route.params.slug)
if (!SLUGS.includes(slug as (typeof SLUGS)[number])) {
  throw createError({ status: 404, statusText: 'Page not found' })
}

const HIGHLIGHT_COUNT = 6
const { t } = useI18n()
const localePath = useLocalePath()
const { start, demo } = useProductLinks()
useReveal()

const base = `marketing.features.items.${slug}`
const highlights = computed(() =>
  Array.from({ length: HIGHLIGHT_COUNT }, (_, i) => t(`${base}.highlights.${i}`)),
)

useSeoMeta({
  title: () => t(`${base}.metaTitle`),
  description: () => t(`${base}.metaDescription`),
  ogTitle: () => t(`${base}.metaTitle`),
  ogDescription: () => t(`${base}.metaDescription`),
  ogType: 'article',
  ogSiteName: 'Pukalani',
})
</script>

<template>
  <div class="feat-page">
    <section class="feat-hero tone-mist">
      <div class="feat-puka puka-glow" data-parallax="0.1" aria-hidden="true" />
      <div class="mkt-inner mkt-narrow feat-hero-inner" data-reveal>
        <NuxtLink :to="localePath('/')" class="mkt-back">
          <UIcon name="i-ph-arrow-left-bold" /> {{ t('marketing.features.backHome') }}
        </NuxtLink>
        <p class="mkt-kicker">{{ t(`${base}.name`) }}</p>
        <h1 class="feat-title">{{ t(`${base}.title`) }}</h1>
        <p class="feat-sub">{{ t(`${base}.sub`) }}</p>
        <p class="mkt-lead">{{ t(`${base}.intro`) }}</p>
      </div>
    </section>

    <section class="mkt-section tone-sky">
      <div class="mkt-inner mkt-narrow" data-reveal>
        <h2 class="mkt-h2">{{ t('marketing.features.highlightsTitle') }}</h2>
        <ul class="feat-list">
          <li v-for="item in highlights" :key="item">
            <UIcon name="i-ph-check-circle-fill" /> <span>{{ item }}</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- Bausteine-Übersicht: gleiche Claim-Gates wie überall -->
    <BlocksSection />

    <section class="mkt-cta-block tone-ink">
      <div class="mkt-inner mkt-narrow mkt-cta-inner" data-reveal>
        <PukaMark :size="38" />
        <h2 class="mkt-cta-title">{{ t('marketing.features.ctaTitle') }}</h2>
        <p class="mkt-cta-lead">{{ t('marketing.features.ctaLead') }}</p>
        <div class="feat-cta-buttons">
          <UButton :to="start" color="warning" size="xl">{{ t('marketing.hero.ctaPrimary') }}</UButton>
          <UButton :to="demo" variant="ghost" color="neutral" size="xl" icon="i-ph-play-circle" class="feat-ghost">
            {{ t('marketing.hero.ctaSecondary') }}
          </UButton>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.feat-hero {
  position: relative;
  padding: clamp(3rem, 7vw, 5.5rem) 1.5rem clamp(2.5rem, 5vw, 4rem);
  overflow: clip;
}
.feat-puka { top: -16rem; right: -12rem; width: 34rem; height: 34rem; opacity: 0.55; }
.feat-hero-inner { position: relative; }
.feat-title {
  font-size: clamp(1.9rem, 4.6vw, 3rem);
  font-weight: 850;
  letter-spacing: -0.02em;
  line-height: 1.06;
  margin: 0.5rem 0 0;
  text-wrap: balance;
}
.feat-sub {
  margin: 0.75rem 0 1.25rem;
  font-size: clamp(1.05rem, 1.6vw, 1.25rem);
  font-weight: 600;
  color: hsl(var(--puka-sun-deep));
}
.feat-list {
  margin: 1.75rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.feat-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  line-height: 1.55;
  color: hsl(var(--puka-ink));
  font-weight: 500;
}
.feat-list :deep(svg) {
  width: 1.2rem;
  height: 1.2rem;
  flex: none;
  margin-top: 0.15rem;
  color: hsl(var(--puka-sun-deep));
}
.feat-cta-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  justify-content: center;
  margin-top: 1.75rem;
}
.feat-ghost { color: hsl(var(--puka-cloud)); }
</style>
