<script setup lang="ts">
// Die kinematische Startseite (Konzept §3.2 / §6.4). Szenen-Reihenfolge im DOM
// = Reihenfolge der Beats.
import { FAQ_COUNT } from '#shared/marketing'

definePageMeta({ layout: 'site' })
useReveal()

const { t, locale } = useI18n()
const baseUrl = useSiteBaseUrl()

// Meta (Title/Description je Locale) — Canonical/Hreflang liefert useLocaleHead
// (app.vue). og:image = seiteneigenes Bild aus public/og (scripts/og-images.mjs).
// Die einzige Seite mit `website`; alle Unterseiten sind `article`.
useMarketingSeo({
  titleKey: 'marketing.meta.title',
  descriptionKey: 'marketing.meta.description',
  image: 'home',
  type: 'website',
})

// Strukturierte Daten — ehrlich (keine erfundenen Bewertungen/Preise, §5).
// Die Anzahl der Fragen steht in shared/marketing.ts: dieses JSON-LD, das der
// /faq-Seite und die sichtbare FaqSection müssen dieselbe Liste beschreiben.
const faqIndices = Array.from({ length: FAQ_COUNT }, (_, i) => i)
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
    <AudienceSection />
    <ComparisonSection />
    <ProofSection />
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
