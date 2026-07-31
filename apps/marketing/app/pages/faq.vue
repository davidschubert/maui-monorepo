<script setup lang="ts">
// Dedizierte FAQ-Seite (§3.1) für Frage-Keywords/Featured Snippets. Nutzt
// dieselbe FaqSection wie die Startseite — eine Quelle, eine Wahrheit — und
// liefert das FAQPage-JSON-LD hier eigenständig (auf der Startseite steckt es
// im Seiten-Graph).
definePageMeta({ layout: 'site' })
defineI18nRoute({ paths: { en: '/faq', de: '/faq' } })

const FAQ_COUNT = 6
const { t } = useI18n()
const localePath = useLocalePath()
const { start } = useProductLinks()
useReveal()

const ctaLinks = computed(() => [
  { to: start, color: 'primary' as const, size: 'xl' as const, label: t('marketing.cta.primary') },
])

const ogImage = useOgImage('faq')

useSeoMeta({
  title: () => t('marketing.faq.metaTitle'),
  description: () => t('marketing.faq.metaDescription'),
  ogTitle: () => t('marketing.faq.metaTitle'),
  ogDescription: () => t('marketing.faq.metaDescription'),
  ogType: 'article',
  ogSiteName: 'Pukalani',
  ogImage: () => ogImage.value,
  twitterImage: () => ogImage.value,
})

const jsonLd = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  'mainEntity': Array.from({ length: FAQ_COUNT }, (_, i) => ({
    '@type': 'Question',
    'name': t(`marketing.faq.items.${i}.q`),
    'acceptedAnswer': { '@type': 'Answer', 'text': t(`marketing.faq.items.${i}.a`) },
  })),
}))
useHead(() => ({
  script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd.value) }],
}))
</script>

<template>
  <div class="faq-page">
    <!--
      Auch dieser schlanke Kopf ist ein `UPageHero` und KEIN `UPageHeader`:
      `UPageHeader` bringt eine untere Trennlinie und eine feste `py-8` mit —
      die Optik einer Dashboard-Seitenkopfzeile. Die Marketing-Köpfe sind
      randlose `tone-*`-Bänder mit stufenlosem Rhythmus, und das ist die
      Bauform von `UPageHero`. „Schlank" heißt hier nur: weniger gefüllte
      Eigenschaften (kein Lead), nicht ein anderer Bauklotz — zwei Verträge für
      dieselbe Optik wären eine Doppelpflege.
      Die drei abweichenden Maße stehen als Variablen an der Wurzel.
    -->
    <UPageHero
      as="section"
      class="tone-mist [--mkt-hero-pb:clamp(1.5rem,3vw,2.5rem)] [--mkt-hero-pt:clamp(3rem,7vw,5rem)] [--mkt-hero-title:clamp(1.8rem,4.2vw,2.6rem)]"
      :title="t('marketing.faq.title')"
    >
      <template #headline>
        <UButton
          :to="localePath('/')" variant="link" color="neutral" size="sm"
          icon="i-ph-arrow-left-bold"
          class="mb-5 px-0 font-semibold text-toned hover:text-primary-600"
          :label="t('marketing.legal.backHome')"
        />
        <p class="mkt-kicker">{{ t('marketing.faq.kicker') }}</p>
      </template>
    </UPageHero>

    <FaqSection />

    <UPageCTA
      as="section"
      class="tone-ink"
      :description="t('marketing.cta.lead')"
      :links="ctaLinks"
    >
      <template #title>
        <PukaMark :size="38" class="mx-auto mb-3.5 block" />
        {{ t('marketing.cta.title') }}
      </template>
    </UPageCTA>
  </div>
</template>
