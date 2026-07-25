<script setup lang="ts">
// Die kinematische Startseite (Konzept §3.2 / §6.4). Szenen-Reihenfolge im DOM
// = Reihenfolge der Beats.
definePageMeta({ layout: 'site' })
useReveal()

const { t, locale } = useI18n()
const config = useRuntimeConfig()
const baseUrl = ((config.public as Record<string, unknown>).i18nBaseUrl as string) || 'https://pukalani.app'

// Meta (Title/Description je Locale) — Canonical/Hreflang liefert useLocaleHead
// (app.vue). og:image bewusst offen bis ein echtes Social-Bild vorliegt.
useSeoMeta({
  title: () => t('marketing.meta.title'),
  description: () => t('marketing.meta.description'),
  ogTitle: () => t('marketing.meta.title'),
  ogDescription: () => t('marketing.meta.description'),
  ogType: 'website',
  ogSiteName: 'Pukalani',
  twitterCard: 'summary_large_image',
})

// Strukturierte Daten — ehrlich (keine erfundenen Bewertungen/Preise, §5).
const faqIndices = [0, 1, 2, 3, 4, 5]
const jsonLd = computed(() => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      'name': 'Pukalani',
      'url': baseUrl,
      'description': t('marketing.meta.description'),
    },
    {
      '@type': 'SoftwareApplication',
      'name': 'Pukalani',
      'applicationCategory': 'BusinessApplication',
      'operatingSystem': 'Web',
      'description': t('marketing.meta.description'),
      'url': baseUrl,
      'inLanguage': locale.value,
    },
    {
      '@type': 'FAQPage',
      'mainEntity': faqIndices.map(i => ({
        '@type': 'Question',
        'name': t(`marketing.faq.items.${i}.q`),
        'acceptedAnswer': { '@type': 'Answer', 'text': t(`marketing.faq.items.${i}.a`) },
      })),
    },
  ],
}))

useHead(() => ({
  script: [
    { type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd.value) },
  ],
}))
</script>

<template>
  <div class="mkt-page">
    <HeroSection />
    <ProblemSection />
    <StepsSection />
    <BlocksSection />
    <ModularSection />
    <PrivacySection />
    <ComparisonSection />
    <PricingSection />
    <StorySection />
    <!-- Bewusste Abweichung von §6.4 (dort CTA → FAQ): die FAQ steht VOR der
         CTA, damit das Licht-Motiv (§6.3) monoton zum Peak aufhellt und die
         Seite auf dem dunkelwarmen Abschluss-CTA endet — CTA (dunkel) → FAQ
         (hell) → Footer (dunkel) hätte wie ein Fehler gewirkt. Inhaltlich
         entkräftet die FAQ die letzten Zweifel direkt VOR der Aufforderung. -->
    <FaqSection />
    <CtaSection />
  </div>
</template>
