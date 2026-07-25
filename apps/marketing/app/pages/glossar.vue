<script setup lang="ts">
// Glossar (§3.1): EN /glossary · DE /de/glossar. Definitions-Keywords +
// interne Verlinkung. Als <dl> ausgezeichnet (semantisch eine Definitionsliste,
// kein Karten-Zoo) und mit DefinedTermSet-JSON-LD.
definePageMeta({ layout: 'site' })
defineI18nRoute({
  paths: { en: '/glossary', de: '/glossar' },
})

const TERM_COUNT = 12
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { start } = useProductLinks()
useReveal()

const terms = computed(() =>
  Array.from({ length: TERM_COUNT }, (_, i) => ({
    term: t(`marketing.glossary.terms.${i}.term`),
    def: t(`marketing.glossary.terms.${i}.def`),
  })),
)

useSeoMeta({
  title: () => t('marketing.glossary.metaTitle'),
  description: () => t('marketing.glossary.metaDescription'),
  ogTitle: () => t('marketing.glossary.metaTitle'),
  ogDescription: () => t('marketing.glossary.metaDescription'),
  ogType: 'article',
  ogSiteName: 'Pukalani',
})

// Strukturierte Daten passend zum Inhaltstyp (keine erfundenen Werte).
const jsonLd = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'DefinedTermSet',
  'name': t('marketing.glossary.title'),
  'inLanguage': locale.value,
  'hasDefinedTerm': terms.value.map(entry => ({
    '@type': 'DefinedTerm',
    'name': entry.term,
    'description': entry.def,
  })),
}))
useHead(() => ({
  script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd.value) }],
}))
</script>

<template>
  <div class="glos-page">
    <section class="glos-hero tone-mist">
      <div class="glos-puka puka-glow" data-parallax="0.1" aria-hidden="true" />
      <div class="mkt-inner mkt-narrow glos-hero-inner" data-reveal>
        <NuxtLink :to="localePath('/')" class="mkt-back">
          <UIcon name="i-ph-arrow-left-bold" /> {{ t('marketing.audiencePages.backHome') }}
        </NuxtLink>
        <p class="mkt-kicker">{{ t('marketing.glossary.kicker') }}</p>
        <h1 class="glos-title">{{ t('marketing.glossary.title') }}</h1>
        <p class="mkt-lead">{{ t('marketing.glossary.lead') }}</p>
      </div>
    </section>

    <section class="mkt-section tone-sky">
      <dl class="glos-list mkt-inner" data-reveal>
        <div v-for="entry in terms" :key="entry.term" class="glos-item">
          <dt class="glos-term">{{ entry.term }}</dt>
          <dd class="glos-def">{{ entry.def }}</dd>
        </div>
      </dl>
    </section>

    <section class="mkt-cta-block tone-ink">
      <div class="mkt-inner mkt-narrow mkt-cta-inner" data-reveal>
        <PukaMark :size="38" />
        <h2 class="mkt-cta-title">{{ t('marketing.glossary.ctaTitle') }}</h2>
        <p class="mkt-cta-lead">{{ t('marketing.glossary.ctaLead') }}</p>
        <UButton :to="start" color="warning" size="xl" class="mkt-cta-btn">
          {{ t('marketing.hero.ctaPrimary') }}
        </UButton>
      </div>
    </section>
  </div>
</template>

<style scoped>
.glos-hero {
  position: relative;
  padding: clamp(3rem, 7vw, 5.5rem) 1.5rem clamp(2.5rem, 5vw, 4rem);
  overflow: clip;
}
.glos-puka { top: -16rem; right: -12rem; width: 32rem; height: 32rem; opacity: 0.5; }
.glos-hero-inner { position: relative; }
.glos-title {
  font-size: clamp(1.9rem, 4.6vw, 3rem);
  font-weight: 850;
  letter-spacing: -0.02em;
  line-height: 1.06;
  margin: 0.5rem 0 1rem;
  text-wrap: balance;
}

.glos-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin: 0;
}
.glos-item {
  padding: 1.3rem 1.4rem;
  border-radius: 0.9rem;
  background: hsl(0 0% 100% / 0.62);
  border: 1px solid hsl(var(--puka-ink) / 0.08);
}
.glos-term {
  font-weight: 800;
  font-size: 1.05rem;
  color: hsl(var(--puka-ink));
  margin-bottom: 0.3rem;
}
.glos-def {
  margin: 0;
  color: hsl(var(--puka-ink-soft));
  line-height: 1.6;
}

@media (min-width: 780px) { .glos-list { grid-template-columns: repeat(2, 1fr); } }
</style>
