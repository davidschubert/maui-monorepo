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
    <section class="faq-page-hero tone-mist">
      <div class="mkt-inner mkt-narrow" data-reveal>
        <NuxtLink :to="localePath('/')" class="mkt-back">
          <UIcon name="i-ph-arrow-left-bold" /> {{ t('marketing.legal.backHome') }}
        </NuxtLink>
        <p class="mkt-kicker">{{ t('marketing.faq.kicker') }}</p>
        <h1 class="faq-page-title">{{ t('marketing.faq.title') }}</h1>
      </div>
    </section>

    <FaqSection />

    <section class="mkt-cta-block tone-ink">
      <div class="mkt-inner mkt-narrow mkt-cta-inner" data-reveal>
        <PukaMark :size="38" />
        <h2 class="mkt-cta-title">{{ t('marketing.cta.title') }}</h2>
        <p class="mkt-cta-lead">{{ t('marketing.cta.lead') }}</p>
        <UButton :to="start" color="primary" size="xl" class="mkt-cta-btn">
          {{ t('marketing.cta.primary') }}
        </UButton>
      </div>
    </section>
  </div>
</template>

<style scoped>
.faq-page-hero { padding: clamp(3rem, 7vw, 5rem) 1.5rem clamp(1.5rem, 3vw, 2.5rem); }
.faq-page-title {
  font-size: clamp(1.8rem, 4.2vw, 2.6rem);
  font-weight: 850;
  letter-spacing: -0.02em;
  margin-top: 0.4rem;
  text-wrap: balance;
}
</style>
