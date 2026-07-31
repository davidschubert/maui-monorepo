<script setup lang="ts">
// Anwendungsfall-Seiten (§3.1): coaches · kurse · creator · vereine.
// Nischen-Long-Tail + Identifikation; jede Seite endet mit CTA und verlinkt
// zurück (Silo-SEO). Claim-Gates (§2.4) respektiert: noch nicht ausgelieferte
// Bausteine stehen als „später" in der Bausteine-Zeile, nie als Zusage.
//
// EIN Segment für beide Sprachen: /use-cases/* (EN) · /de/use-cases/* (DE) —
// Davids Entscheidung 2026-07-30. Vorher trug jede Sprache ihr eigenes Segment
// (EN /for/* · DE /de/fuer/*); zwei Segmente für dieselbe Seite bedeuten zwei
// Adressen zu pflegen, und „use case" ist auch im Deutschen der geläufige
// Begriff. Ohne defineI18nRoute-Pfade nimmt i18n den Dateipfad in beiden
// Sprachen (DE mit /de-Präfix). Die alten Adressen leiten per routeRules 301
// weiter (apps/marketing/nuxt.config.ts).
definePageMeta({ layout: 'site' })

const SLUGS = ['coaches', 'kurse', 'creator', 'vereine'] as const
const route = useRoute()
const slug = String(route.params.slug)
if (!SLUGS.includes(slug as (typeof SLUGS)[number])) {
  throw createError({ status: 404, statusText: 'Page not found' })
}

const { t } = useI18n()
const localePath = useLocalePath()
const { start, demo } = useProductLinks()
useReveal()

const base = `marketing.audiencePages.items.${slug}`

const ogImage = useOgImage(`use-cases-${slug}`)

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
  <div class="fuer-page">
    <section class="fuer-hero tone-mist">
      <div class="fuer-puka puka-glow" data-parallax="0.1" aria-hidden="true" />
      <div class="mkt-inner mkt-narrow fuer-hero-inner" data-reveal>
        <!-- Zurück-Link über die geteilte .mkt-back-Klasse; die frühere
             eigene .fuer-back-Kopie war Zeile für Zeile dieselbe Regel. -->
        <NuxtLink :to="localePath('/')" class="mkt-back">
          <UIcon name="i-ph-arrow-left-bold" /> {{ t('marketing.audiencePages.backHome') }}
        </NuxtLink>
        <p class="mkt-kicker">{{ t(`${base}.name`) }}</p>
        <h1 class="fuer-title">{{ t(`${base}.title`) }}</h1>
        <p class="fuer-sub">{{ t(`${base}.sub`) }}</p>
        <p class="mkt-lead">{{ t(`${base}.intro`) }}</p>
      </div>
    </section>

    <section class="mkt-section tone-dawn">
      <UPageGrid as="div" class="mkt-inner mkt-narrow gap-5 sm:grid-cols-1 lg:grid-cols-2" data-reveal>
        <UPageCard as="article" :description="t(`${base}.fit`)">
          <template #title>
            <h2>{{ t('marketing.audiencePages.fitTitle') }}</h2>
          </template>
        </UPageCard>
        <!-- Die Bausteine-Karte war schon vorher die betonte der beiden
             (Akzentkante links); in Nuxt UI ist das `highlight`. -->
        <UPageCard as="article" highlight :description="t(`${base}.blocks`)">
          <template #title>
            <h2>{{ t('marketing.audiencePages.blocksTitle') }}</h2>
          </template>
        </UPageCard>
      </UPageGrid>
    </section>

    <!-- Bausteine + Preise sind auf jeder Anwendungsfall-Seite dieselbe
         Wahrheit wie auf der Startseite (eine Quelle, gleiche Claim-Gates). -->
    <BlocksSection />
    <PricingSection />

    <section class="fuer-cta tone-ink">
      <div class="mkt-inner mkt-narrow fuer-cta-inner" data-reveal>
        <PukaMark :size="38" />
        <h2 class="fuer-cta-title">{{ t('marketing.audiencePages.ctaTitle') }}</h2>
        <p class="fuer-cta-lead">{{ t('marketing.audiencePages.ctaLead') }}</p>
        <div class="fuer-cta-buttons">
          <UButton :to="start" color="primary" size="xl">{{ t('marketing.hero.ctaPrimary') }}</UButton>
          <UButton :to="demo" variant="ghost" color="neutral" size="xl" icon="i-ph-play-circle" class="fuer-ghost">
            {{ t('marketing.hero.ctaSecondary') }}
          </UButton>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.fuer-hero {
  position: relative;
  padding: clamp(3rem, 7vw, 5.5rem) 1.5rem clamp(2.5rem, 5vw, 4rem);
  overflow: clip;
}
.fuer-puka {
  top: -16rem;
  left: -12rem;
  width: 34rem;
  height: 34rem;
  opacity: 0.55;
}
.fuer-hero-inner { position: relative; }
.fuer-title {
  font-size: clamp(1.9rem, 4.6vw, 3rem);
  font-weight: 850;
  letter-spacing: -0.02em;
  line-height: 1.06;
  margin-top: 0.5rem;
  text-wrap: balance;
}
.fuer-sub {
  margin: 0.75rem 0 1.25rem;
  font-size: clamp(1.05rem, 1.6vw, 1.25rem);
  font-weight: 600;
  color: hsl(var(--puka-sun-deep));
}

.fuer-cta {
  padding: clamp(3rem, 7vw, 5rem) 1.5rem;
  text-align: center;
}
.fuer-cta-inner { display: flex; flex-direction: column; align-items: center; }
.fuer-cta-title {
  font-size: clamp(1.6rem, 3.6vw, 2.4rem);
  font-weight: 850;
  margin: 0.9rem 0 0.6rem;
  color: hsl(var(--puka-cloud));
}
.fuer-cta-lead { color: hsl(var(--puka-mist) / 0.85); }
.fuer-cta-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  justify-content: center;
  margin-top: 1.75rem;
}
.fuer-ghost { color: hsl(var(--puka-cloud)); }
</style>
