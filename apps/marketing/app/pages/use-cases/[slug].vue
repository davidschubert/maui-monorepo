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
import { AUDIENCE_SLUGS } from '#shared/marketing'

definePageMeta({ layout: 'site' })

// Slug-Katalog aus shared/ — dieselbe Liste baut die Sitemap.
const route = useRoute()
const slug = String(route.params.slug)
if (!AUDIENCE_SLUGS.includes(slug as (typeof AUDIENCE_SLUGS)[number])) {
  throw createError({ status: 404, statusText: 'Page not found' })
}

const { t } = useI18n()
const localePath = useLocalePath()
const { start, demo } = useProductLinks()
useReveal()

const base = `marketing.audiencePages.items.${slug}`

const ctaLinks = computed(() => [
  { to: start, color: 'primary' as const, size: 'xl' as const, label: t('marketing.hero.ctaPrimary') },
  {
    to: demo,
    color: 'neutral' as const,
    variant: 'ghost' as const,
    size: 'xl' as const,
    icon: 'i-ph-play-circle',
    label: t('marketing.hero.ctaSecondary'),
  },
])

useMarketingSeo({
  titleKey: `${base}.metaTitle`,
  descriptionKey: `${base}.metaDescription`,
  image: `use-cases-${slug}`,
})
</script>

<template>
  <div class="fuer-page">
    <UPageHero as="section" class="tone-mist" :title="t(`${base}.title`)" :ui="{ description: 'max-w-none' }">
      <template #top>
        <div class="fuer-puka puka-glow" data-parallax="0.1" aria-hidden="true" />
      </template>
      <template #headline>
        <!-- Zurück-Link im selben Muster wie auf allen Unterseiten: ein
             `UButton variant="link"` (der Bestand hatte hier einen
             NuxtLink mit .mkt-back-Klasse, auf den Rechtsseiten aber schon
             diesen Knopf — jetzt EIN Muster). -->
        <UButton
          :to="localePath('/')" variant="link" color="neutral" size="sm"
          icon="i-ph-arrow-left-bold"
          class="mb-5 px-0 font-semibold text-toned hover:text-primary-600"
          :label="t('marketing.audiencePages.backHome')"
        />
        <p class="mkt-kicker">{{ t(`${base}.name`) }}</p>
      </template>
      <!-- Farbige Unterzeile + Lead in EINEM Slot (Begründung wie auf den
           Produktseiten: zwischen Titel und Beschreibung gibt es keinen Slot). -->
      <template #description>
        <p class="mb-5 font-semibold text-primary-600">{{ t(`${base}.sub`) }}</p>
        <p class="max-w-[42rem]">{{ t(`${base}.intro`) }}</p>
      </template>
    </UPageHero>

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

    <UPageCTA
      as="section"
      class="tone-ink"
      :description="t('marketing.audiencePages.ctaLead')"
      :links="ctaLinks"
    >
      <template #title>
        <PukaMark :size="38" class="mx-auto mb-3.5 block" />
        {{ t('marketing.audiencePages.ctaTitle') }}
      </template>
    </UPageCTA>
  </div>
</template>

<style scoped>
/* Nur noch das Bildmotiv — Rhythmus und Typografie von Kopf und Schluss
   kommen aus den `pageHero`-/`pageCTA`-Verträgen in app/app.config.ts. */
.fuer-puka {
  top: -16rem;
  left: -12rem;
  width: 34rem;
  height: 34rem;
  opacity: 0.55;
}
</style>
