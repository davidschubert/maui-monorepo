<script setup lang="ts">
// SEO-Vergleichsseiten (§3.1): /vs/circle · /vs/skool · /vs/mighty-networks
// (EN unter /vs/*, DE unter /de/vs/* — prefix_except_default). Long-Tail-
// Abwerbe-Keywords, ehrlich: jede Seite sagt AUCH, wann der Wettbewerber die
// bessere Wahl ist. Die Vergleichstabelle ist bewusst dieselbe Komponente wie
// auf der Startseite (eine Quelle, ein Stand-Datum, dieselben Quellen-Links).
definePageMeta({ layout: 'site' })

const SLUGS = ['circle', 'skool', 'mighty-networks'] as const
const route = useRoute()
const slug = String(route.params.slug)
if (!SLUGS.includes(slug as (typeof SLUGS)[number])) {
  throw createError({ status: 404, statusText: 'Page not found' })
}

const { t } = useI18n()
const localePath = useLocalePath()
const { start, demo } = useProductLinks()
useReveal()

const base = `marketing.vs.items.${slug}`
const name = computed(() => t(`${base}.name`))

const ogImage = useOgImage(`vs-${slug}`)

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
  <div class="vs-page">
    <section class="vs-hero tone-mist">
      <div class="vs-puka puka-glow" data-parallax="0.1" aria-hidden="true" />
      <div class="mkt-inner mkt-narrow vs-hero-inner" data-reveal>
        <NuxtLink :to="localePath('/')" class="vs-back">
          <UIcon name="i-ph-arrow-left-bold" /> {{ t('marketing.vs.backHome') }}
        </NuxtLink>
        <h1 class="vs-title">{{ t(`${base}.title`) }}</h1>
        <p class="vs-sub">{{ t(`${base}.sub`) }}</p>
        <p class="mkt-lead vs-intro">{{ t(`${base}.intro`) }}</p>
      </div>
    </section>

    <!-- dieselbe Tabelle wie auf der Startseite: ein Stand, eine Wahrheit -->
    <ComparisonSection />

    <section class="mkt-section tone-dawn-hold">
      <div class="mkt-inner mkt-narrow vs-when" data-reveal>
        <article class="when-card when-them">
          <h2 class="when-title">{{ t('marketing.vs.whenThemTitle', { name }) }}</h2>
          <p>{{ t(`${base}.whenThem`) }}</p>
        </article>
        <article class="when-card when-us">
          <h2 class="when-title">{{ t('marketing.vs.whenUsTitle') }}</h2>
          <p>{{ t(`${base}.whenUs`) }}</p>
        </article>
      </div>
    </section>

    <section class="vs-cta tone-ink">
      <div class="mkt-inner mkt-narrow vs-cta-inner" data-reveal>
        <PukaMark :size="38" />
        <h2 class="vs-cta-title">{{ t('marketing.vs.ctaTitle') }}</h2>
        <p class="vs-cta-lead">{{ t('marketing.vs.ctaLead') }}</p>
        <div class="vs-cta-buttons">
          <UButton :to="start" color="primary" size="xl">{{ t('marketing.hero.ctaPrimary') }}</UButton>
          <UButton :to="demo" variant="ghost" color="neutral" size="xl" icon="i-ph-play-circle" class="vs-ghost">
            {{ t('marketing.hero.ctaSecondary') }}
          </UButton>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.vs-hero {
  position: relative;
  padding: clamp(3rem, 7vw, 5.5rem) 1.5rem clamp(2.5rem, 5vw, 4rem);
  overflow: clip;
}
.vs-puka {
  top: -16rem;
  right: -12rem;
  width: 34rem;
  height: 34rem;
  opacity: 0.6;
}
.vs-hero-inner { position: relative; }
.vs-back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: hsl(var(--puka-ink-soft));
  text-decoration: none;
  margin-bottom: 1.25rem;
}
.vs-back:hover { color: hsl(var(--puka-sun-deep)); }
.vs-title {
  font-size: clamp(2rem, 5vw, 3.2rem);
  font-weight: 850;
  letter-spacing: -0.02em;
  line-height: 1.05;
  text-wrap: balance;
}
.vs-sub {
  margin: 0.75rem 0 1.25rem;
  font-size: clamp(1.05rem, 1.6vw, 1.25rem);
  font-weight: 600;
  color: hsl(var(--puka-sun-deep));
}
.vs-intro { max-width: 44rem; }

.vs-when {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
}
.when-card {
  padding: 1.5rem;
  border-radius: 1rem;
  background: hsl(0 0% 100% / 0.6);
  border: 1px solid hsl(var(--puka-ink) / 0.08);
  line-height: 1.6;
  color: hsl(var(--puka-ink-soft));
}
.when-us { border-left: 3px solid hsl(var(--puka-sun)); }
.when-title {
  font-size: 1.15rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
  color: hsl(var(--puka-ink));
}

.vs-cta {
  padding: clamp(3rem, 7vw, 5rem) 1.5rem;
  text-align: center;
}
.vs-cta-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.vs-cta-title {
  font-size: clamp(1.6rem, 3.6vw, 2.4rem);
  font-weight: 850;
  margin: 0.9rem 0 0.6rem;
  color: hsl(var(--puka-cloud));
}
.vs-cta-lead { color: hsl(var(--puka-mist) / 0.85); }
.vs-cta-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  justify-content: center;
  margin-top: 1.75rem;
}
.vs-ghost { color: hsl(var(--puka-cloud)); }

@media (min-width: 820px) {
  .vs-when { grid-template-columns: 1fr 1fr; }
}
</style>
