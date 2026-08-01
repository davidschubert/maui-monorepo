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

useMarketingSeo({
  titleKey: 'marketing.glossary.metaTitle',
  descriptionKey: 'marketing.glossary.metaDescription',
  image: 'glossary',
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
    <!--
      Schlanker Kopf im Muster von /faq: Kicker, Titel, Lead — und dann sofort
      die Liste. Dieselben drei abweichenden Maße wie dort, und aus demselben
      Grund KEINE Glow-Bühne: der Lichtkreis ist die Inszenierung der
      Einstiegsseiten (Produkte, Zielgruppen, /wechseln, /dsgvo — dort trägt
      der Kopf eine farbige Unterzeile bzw. einen Hinweiskasten und darf eine
      Bühne sein). Ein Nachschlagewerk hat kein Versprechen zu machen; der
      Besucher kommt wegen EINES Begriffs und will die Liste sehen.
      Nebenwirkung, die es zusätzlich verbietet: der Kreis misst 32rem und die
      Hero-Sektion trägt `overflow-clip` — in einem kürzeren Kopf bliebe von
      ihm ein angeschnittener Bogen statt eines Lichts.
    -->
    <UPageHero
      as="section"
      class="tone-mist [--mkt-hero-pb:clamp(1.5rem,3vw,2.5rem)] [--mkt-hero-pt:clamp(3rem,7vw,5rem)] [--mkt-hero-title:clamp(1.8rem,4.2vw,2.6rem)]"
      :title="t('marketing.glossary.title')"
      :description="t('marketing.glossary.lead')"
    >
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
/* Nur noch die Liste — Rhythmus und Typografie des Kopfes kommen aus dem
   `pageHero`-Vertrag in app/app.config.ts, das Bildmotiv ist mit der
   Glow-Bühne entfallen (Begründung an der Hero-Sektion). */
.glos-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  /* NUR die Block-Ränder des <dl>-UA-Defaults nehmen. Eine margin-KURZFORM
     (`margin: 0`) löschte hier auch die SEITENränder — und damit das
     `margin: 0 auto`, mit dem `.mkt-inner` in marketing.css zentriert (dieselbe
     Falle wie in BlocksSection.vue beschrieben: die Regel ist ungeschichtet und
     kommt aus derselben Klasse, es gewinnt schlicht die spätere Deklaration). */
  margin-block: 0;
}
.glos-item {
  padding: 1.3rem 1.4rem;
  border-radius: 0.9rem;
  background: hsl(var(--puka-paper) / 0.62);
  /* Haarlinie wie jede Karte der Seite — siehe `--puka-card-edge`. */
  border: 1px solid var(--puka-card-edge);
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
