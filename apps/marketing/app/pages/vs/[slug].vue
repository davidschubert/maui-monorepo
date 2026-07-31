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
    <UPageHero
      as="section"
      class="tone-mist [--mkt-hero-title:clamp(2rem,5vw,3.2rem)]"
      :title="t(`${base}.title`)"
      :ui="{ title: 'leading-[1.05]', description: 'max-w-none' }"
    >
      <template #top>
        <div class="vs-puka puka-glow" data-parallax="0.1" aria-hidden="true" />
      </template>
      <!-- Diese Seite führt OHNE Kicker — der Augenbrauen-Bereich trägt nur
           den Zurück-Link (gleiches Muster wie auf allen Unterseiten). -->
      <template #headline>
        <UButton
          :to="localePath('/')" variant="link" color="neutral" size="sm"
          icon="i-ph-arrow-left-bold"
          class="mb-3 px-0 font-semibold text-toned hover:text-primary-600"
          :label="t('marketing.vs.backHome')"
        />
      </template>
      <!-- Farbige Unterzeile + Lead in EINEM Slot (Begründung wie auf den
           Produktseiten: zwischen Titel und Beschreibung gibt es keinen Slot). -->
      <template #description>
        <p class="mb-5 font-semibold text-primary-600">{{ t(`${base}.sub`) }}</p>
        <p class="max-w-[44rem]">{{ t(`${base}.intro`) }}</p>
      </template>
    </UPageHero>

    <!-- dieselbe Tabelle wie auf der Startseite: ein Stand, eine Wahrheit -->
    <ComparisonSection />

    <section class="mkt-section tone-dawn-hold">
      <UPageGrid as="div" class="mkt-inner mkt-narrow gap-5 sm:grid-cols-1 lg:grid-cols-2" data-reveal>
        <UPageCard as="article" :description="t(`${base}.whenThem`)">
          <template #title>
            <h2>{{ t('marketing.vs.whenThemTitle', { name }) }}</h2>
          </template>
        </UPageCard>
        <!-- „Wann wir" war schon vorher die betonte Karte (Akzentkante
             links) — in Nuxt UI ist das `highlight`. -->
        <UPageCard as="article" highlight :description="t(`${base}.whenUs`)">
          <template #title>
            <h2>{{ t('marketing.vs.whenUsTitle') }}</h2>
          </template>
        </UPageCard>
      </UPageGrid>
    </section>

    <UPageCTA
      as="section"
      class="tone-ink"
      :description="t('marketing.vs.ctaLead')"
      :links="ctaLinks"
    >
      <template #title>
        <PukaMark :size="38" class="mx-auto mb-3.5 block" />
        {{ t('marketing.vs.ctaTitle') }}
      </template>
    </UPageCTA>
  </div>
</template>

<style scoped>
/* Nur noch das Bildmotiv — Rhythmus und Typografie von Kopf und Schluss
   kommen aus den `pageHero`-/`pageCTA`-Verträgen in app/app.config.ts. */
.vs-puka {
  top: -16rem;
  right: -12rem;
  width: 34rem;
  height: 34rem;
  opacity: 0.6;
}
</style>
