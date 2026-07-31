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

const ctaLinks = computed(() => [
  { to: start, color: 'primary' as const, size: 'xl' as const, label: t('marketing.hero.ctaPrimary') },
])

const ogImage = useOgImage('glossary')

useSeoMeta({
  title: () => t('marketing.glossary.metaTitle'),
  description: () => t('marketing.glossary.metaDescription'),
  ogTitle: () => t('marketing.glossary.metaTitle'),
  ogDescription: () => t('marketing.glossary.metaDescription'),
  ogType: 'article',
  ogSiteName: 'Pukalani',
  ogImage: () => ogImage.value,
  twitterImage: () => ogImage.value,
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
    <UPageHero
      as="section"
      class="tone-mist"
      :title="t('marketing.glossary.title')"
      :description="t('marketing.glossary.lead')"
    >
      <template #top>
        <div class="glos-puka puka-glow" data-parallax="0.1" aria-hidden="true" />
      </template>
      <template #headline>
        <UButton
          :to="localePath('/')" variant="link" color="neutral" size="sm"
          icon="i-ph-arrow-left-bold"
          class="mb-5 px-0 font-semibold text-toned hover:text-primary-600"
          :label="t('marketing.audiencePages.backHome')"
        />
        <p class="mkt-kicker">{{ t('marketing.glossary.kicker') }}</p>
      </template>
    </UPageHero>

    <section class="mkt-section tone-sky">
      <dl class="glos-list mkt-inner" data-reveal>
        <div v-for="entry in terms" :key="entry.term" class="glos-item">
          <dt class="glos-term">{{ entry.term }}</dt>
          <dd class="glos-def">{{ entry.def }}</dd>
        </div>
      </dl>
    </section>

    <UPageCTA
      as="section"
      class="tone-ink"
      :description="t('marketing.glossary.ctaLead')"
      :links="ctaLinks"
    >
      <template #title>
        <PukaMark :size="38" class="mx-auto mb-3.5 block" />
        {{ t('marketing.glossary.ctaTitle') }}
      </template>
    </UPageCTA>
  </div>
</template>

<style scoped>
/* Nur noch das Bildmotiv — Rhythmus und Typografie des Kopfes kommen aus dem
   `pageHero`-Vertrag in app/app.config.ts. */
.glos-puka { top: -16rem; right: -12rem; width: 32rem; height: 32rem; opacity: 0.5; }

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
