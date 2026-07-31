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
//
// Der SLUG ist seit Davids Entscheidung 2026-07-31 übersetzt (wie bei den
// Produkten): /de/use-cases/kurse ↔ /use-cases/course-creators. Das Segment
// bleibt dabei in beiden Sprachen gleich — übersetzt ist nur das Wort, das die
// Zielgruppe benennt. Die drei schon veröffentlichten EN-Adressen mit
// deutschem Slug: 301 in nuxt.config.ts.
import { audienceKeyFromSlug, audienceSlugForLocale } from '#shared/marketing'

definePageMeta({ layout: 'site' })

// Slug-Katalog aus shared/ — dieselbe Quelle baut die Sitemap und die
// Link-Ziele in Abschnitt und Fuß.
const route = useRoute()
const { t, locale } = useI18n()

/**
 * Der Slug in der Adresse gehört der AKTUELLEN Sprache; gearbeitet wird ab hier
 * nur noch mit dem kanonischen Schlüssel (i18n-Texte, OG-Bild). Ein Slug der
 * ANDEREN Sprache ist kein Treffer — `audienceKeyFromSlug` prüft je Sprache,
 * sonst gäbe es dieselbe Seite unter zwei URLs (`/de/use-cases/clubs` wäre
 * dann eine zweite deutsche Adresse für dieselbe Seite).
 */
const audienceKey = audienceKeyFromSlug(String(route.params.slug), locale.value)
if (!audienceKey) {
  throw createError({ status: 404, statusText: 'Page not found' })
}

/**
 * DIE ÜBERSETZTE ADRESSE DIESER SEITE — für `switchLocalePath()` (Sprach-
 * wechsler im Fuß) UND für die hreflang-Alternates aus `useLocaleSeoHead()`.
 * Begründung ausführlich in pages/produkte/[slug].vue: ohne diesen Aufruf
 * reicht i18n den Parameter unverändert weiter, aus `/de/use-cases/kurse`
 * würde `/use-cases/kurse` — eine Adresse, die es nicht mehr gibt (301).
 *
 * `useSetI18nParams()` GIBT die Setz-Funktion ZURÜCK (die Argumente des
 * Composables selbst sind SEO-Optionen) — der zweite Aufruf ist Absicht.
 */
const setI18nParams = useSetI18nParams()
setI18nParams({
  de: { slug: audienceSlugForLocale(audienceKey, 'de') },
  en: { slug: audienceSlugForLocale(audienceKey, 'en') },
})

const localePath = useLocalePath()
const { start, demo } = useProductLinks()
useReveal()

const base = `marketing.audiencePages.items.${audienceKey}`

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

// Das OG-Bild trägt den KANONISCHEN Schlüssel (`use-cases-vereine-en.jpg`,
// nicht `use-cases-clubs-en.jpg`) — bewusst kein Datei-Rename, gleiche
// Begründung wie bei den Produkten: eine Bild-URL ist keine Navigations-URL.
// Sie steht nur im <head>, niemand liest oder verlinkt sie, und ein Rename
// hieße neue Dateien, eine angepasste scripts/og-images.mjs und tote Adressen
// in schon geteilten Vorschauen — für null Wirkung.
useMarketingSeo({
  titleKey: `${base}.metaTitle`,
  descriptionKey: `${base}.metaDescription`,
  image: `use-cases-${audienceKey}`,
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
