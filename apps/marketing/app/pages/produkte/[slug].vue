<script setup lang="ts">
// Feature-Cluster-Seiten (§3.1): diskussionen · moderation · branding ·
// beitraege · kurse · events.
//
// Claim-Gate-Umsetzung (§2.4, Entscheidung David 2026-07-24): Kurse und Events
// SIND Early Access. Ihre Seiten existieren, aber sie dürfen nicht wie ein
// aktueller Tarifbestandteil aussehen. Deshalb:
//   1. ein prominenter Early-Access-Banner GANZ OBEN (nicht kleingedruckt),
//   2. KEIN Kauf-/„Kostenlos starten"-CTA — nur „Early Access anfragen",
//   3. die Highlights beschreiben ausschließlich, was tatsächlich existiert.
//
// Locale-Pfade: EN /products/* · DE /de/produkte/* — Kundensprache ist
// „Produkte" (im CODE bleibt das Vokabular `features`). Die Slugs bleiben
// deutsch, nur das Segment ist lokalisiert.
// Die alten /features/*-URLs waren schon veröffentlicht: 301 in nuxt.config.ts.
definePageMeta({ layout: 'site' })
defineI18nRoute({ paths: { en: '/products/[slug]', de: '/produkte/[slug]' } })

const SLUGS = ['diskussionen', 'moderation', 'branding', 'beitraege', 'kurse', 'events'] as const
/** Bausteine, die noch NICHT im offenen Angebot sind (§2.4). */
const EARLY_ACCESS_SLUGS: readonly string[] = ['beitraege', 'kurse', 'events']
const route = useRoute()
const slug = String(route.params.slug)
if (!SLUGS.includes(slug as (typeof SLUGS)[number])) {
  throw createError({ status: 404, statusText: 'Page not found' })
}

const HIGHLIGHT_COUNT = 6
const { t } = useI18n()
const localePath = useLocalePath()
const { start, demo, signIn } = useProductLinks()
useReveal()

const isEarlyAccess = computed(() => EARLY_ACCESS_SLUGS.includes(slug))

const base = `marketing.features.items.${slug}`
const highlights = computed(() =>
  Array.from({ length: HIGHLIGHT_COUNT }, (_, i) => t(`${base}.highlights.${i}`)),
)

const ogImage = useOgImage(`products-${slug}`)

useSeoMeta({
  title: () => t(`${base}.metaTitle`),
  description: () => t(`${base}.metaDescription`),
  ogTitle: () => t(`${base}.metaTitle`),
  ogDescription: () => t(`${base}.metaDescription`),
  ogType: 'article',
  ogSiteName: 'Pukalani',
  ogImage: () => ogImage.value,
  twitterImage: () => ogImage.value,
  twitterCard: 'summary_large_image',
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

        <!-- Early Access: der Hinweis steht VOR den Vorteilen, nicht danach. -->
        <aside v-if="isEarlyAccess" class="feat-ea">
          <h2 class="feat-ea-title">
            <UIcon name="i-ph-seal-warning-bold" /> {{ t('marketing.features.eaBannerTitle') }}
          </h2>
          <p>{{ t('marketing.features.eaBannerText') }}</p>
        </aside>
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
        <h2 class="mkt-cta-title">
          {{ isEarlyAccess ? t('marketing.features.eaBannerTitle') : t('marketing.features.ctaTitle') }}
        </h2>
        <p class="mkt-cta-lead">
          {{ isEarlyAccess ? t('marketing.features.eaBannerText') : t('marketing.features.ctaLead') }}
        </p>
        <div class="feat-cta-buttons">
          <!-- Early Access: KEIN Kauf-/Gratis-CTA — nur anfragen. -->
          <UButton v-if="isEarlyAccess" :to="signIn" color="warning" size="xl">
            {{ t('marketing.features.eaCta') }}
          </UButton>
          <UButton v-else :to="start" color="warning" size="xl">{{ t('marketing.hero.ctaPrimary') }}</UButton>
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
.feat-ea {
  margin-top: 2rem;
  padding: 1.25rem 1.4rem;
  background: hsl(var(--puka-sun) / 0.16);
  border-left: 3px solid hsl(var(--puka-sun-deep));
  border-radius: 0.7rem;
  color: hsl(var(--puka-ink) / 0.85);
  line-height: 1.6;
}
.feat-ea-title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.95rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: hsl(var(--puka-sun-deep));
  margin-bottom: 0.45rem;
}
.feat-ea-title :deep(svg) { width: 1.1rem; height: 1.1rem; flex: none; }

.feat-cta-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  justify-content: center;
  margin-top: 1.75rem;
}
.feat-ghost { color: hsl(var(--puka-cloud)); }
</style>
