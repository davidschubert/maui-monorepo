<script setup lang="ts">
// Anwendungsfall-Seiten (§3.1): coaches · kurse · creator · vereine.
// Nischen-Long-Tail + Identifikation; jede Seite endet mit CTA und verlinkt
// zurück (Silo-SEO). Claim-Gates (§2.4) respektiert: noch nicht ausgelieferte
// Bausteine stehen als „später" in der Bausteine-Zeile, nie als Zusage.
//
// Locale-Pfade: EN /for/* · DE /de/fuer/* — ein deutsches Pfad-Segment auf der
// englischen Seite wäre für EN-SEO verschenkt. Umgestellt, solange die Site
// noch nicht live ist (keine Redirect-Altlast).
definePageMeta({ layout: 'site' })
defineI18nRoute({ paths: { en: '/for/[slug]', de: '/fuer/[slug]' } })

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

const ogImage = useOgImage(`for-${slug}`)

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
        <NuxtLink :to="localePath('/')" class="fuer-back">
          <UIcon name="i-ph-arrow-left-bold" /> {{ t('marketing.audiencePages.backHome') }}
        </NuxtLink>
        <p class="mkt-kicker">{{ t(`${base}.name`) }}</p>
        <h1 class="fuer-title">{{ t(`${base}.title`) }}</h1>
        <p class="fuer-sub">{{ t(`${base}.sub`) }}</p>
        <p class="mkt-lead">{{ t(`${base}.intro`) }}</p>
      </div>
    </section>

    <section class="mkt-section tone-dawn">
      <div class="mkt-inner mkt-narrow fuer-body" data-reveal>
        <article class="fuer-card">
          <h2 class="fuer-h2">{{ t('marketing.audiencePages.fitTitle') }}</h2>
          <p>{{ t(`${base}.fit`) }}</p>
        </article>
        <article class="fuer-card fuer-blocks">
          <h2 class="fuer-h2">{{ t('marketing.audiencePages.blocksTitle') }}</h2>
          <p>{{ t(`${base}.blocks`) }}</p>
        </article>
      </div>
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
          <UButton :to="start" color="warning" size="xl">{{ t('marketing.hero.ctaPrimary') }}</UButton>
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
.fuer-back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: hsl(var(--puka-ink-soft));
  text-decoration: none;
  margin-bottom: 1.25rem;
}
.fuer-back:hover { color: hsl(var(--puka-sun-deep)); }
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

.fuer-body {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
}
.fuer-card {
  padding: 1.5rem;
  border-radius: 1rem;
  background: hsl(0 0% 100% / 0.6);
  border: 1px solid hsl(var(--puka-ink) / 0.08);
  line-height: 1.6;
  color: hsl(var(--puka-ink-soft));
}
.fuer-blocks { border-left: 3px solid hsl(var(--puka-sun)); }
.fuer-h2 {
  font-size: 1.15rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
  color: hsl(var(--puka-ink));
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

@media (min-width: 820px) { .fuer-body { grid-template-columns: 1fr 1fr; } }
</style>
