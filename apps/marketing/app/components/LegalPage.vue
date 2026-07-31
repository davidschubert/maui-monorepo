<script setup lang="ts">
// Geteiltes Gerüst der Rechtsseiten (Impressum · Datenschutz · AGB).
//
// Diese Seiten sind ENTWÜRFE: die Struktur steht, die verbindlichen Texte
// kommen von David bzw. seiner Rechtsberatung. Deshalb ist der Entwurfs-Hinweis
// nicht kleingedruckt, sondern der erste Block — und die Seiten sind bis dahin
// `noindex`: ein Impressum-Platzhalter im Suchindex wäre schlimmer als keiner.
const props = defineProps<{
  /** i18n-Basis unter marketing.legal (imprint | privacy | terms) */
  scope: 'imprint' | 'privacy' | 'terms'
  /** Anzahl der Abschnitte im jeweiligen Scope */
  sectionCount: number
}>()

const { t } = useI18n()
const localePath = useLocalePath()
useReveal()

const base = computed(() => `marketing.legal.${props.scope}`)
const sections = computed(() =>
  Array.from({ length: props.sectionCount }, (_, i) => ({
    title: t(`${base.value}.sections.${i}.title`),
    body: t(`${base.value}.sections.${i}.body`),
  })),
)

useSeoMeta({
  title: () => t(`${base.value}.metaTitle`),
  // Solange die Texte Entwürfe sind: aus dem Index halten.
  robots: 'noindex, follow',
})
</script>

<template>
  <div class="legal-page">
    <section class="legal-hero tone-mist">
      <div class="mkt-inner mkt-narrow" data-reveal>
        <UButton
          :to="localePath('/')" variant="link" color="neutral" size="sm"
          icon="i-ph-arrow-left-bold"
          class="mb-5 px-0 font-semibold text-toned hover:text-primary-600"
          :label="t('marketing.legal.backHome')"
        />
        <h1 class="legal-title">{{ t(`${base}.title`) }}</h1>
        <p class="mkt-lead">{{ t(`${base}.lead`) }}</p>

        <!-- Der Entwurfs-Hinweis ist der erste Block der Seite, nicht das
             Kleingedruckte: Titel (das frühere Badge) + Text.
             `primary` (die Sonne), NICHT `warning`: der Bestand malte diesen
             Kasten in --puka-sun; es ist ein Ehrlichkeits-Hinweis der Marke,
             keine Fehlermeldung — und `warning` wirkt auf den kühlen
             tone-*-Flächen oliv statt warm. -->
        <UAlert
          color="primary" variant="subtle" icon="i-ph-warning-bold"
          :title="t('marketing.legal.draftBadge')"
          :description="t('marketing.legal.draftNote')"
          class="mt-7"
          :ui="{
            title: 'text-sm font-extrabold uppercase tracking-wide',
            description: 'text-base/relaxed opacity-100',
          }"
        />

        <!-- Von der verbindlichen Datenschutzerklärung zur technischen
             Erklärseite verlinken (und nur dort). Route-NAME statt Pfad-String
             (Regel in MarketingFooter.vue): EN liegt sie unter /gdpr. -->
        <p v-if="scope === 'privacy'" class="mt-5">
          <ULink
            :to="localePath({ name: 'dsgvo' })"
            class="inline-flex items-center gap-1.5 font-bold text-primary-600"
          >
            {{ t('marketing.legal.privacy.seeAlso') }}
            <UIcon name="i-ph-arrow-right-bold" class="size-4" />
          </ULink>
        </p>
      </div>
    </section>

    <section class="mkt-section tone-cloud">
      <div class="mkt-inner mkt-narrow legal-body" data-reveal>
        <section v-for="(section, i) in sections" :key="section.title" class="legal-section">
          <h2 class="legal-h2">{{ i + 1 }}. {{ section.title }}</h2>
          <p>{{ section.body }}</p>
        </section>
        <p class="legal-contact">{{ t('marketing.legal.contactHint') }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.legal-hero {
  padding: clamp(3rem, 7vw, 5rem) 1.5rem clamp(2rem, 4vw, 3rem);
}
.legal-title {
  font-size: clamp(1.8rem, 4.2vw, 2.6rem);
  font-weight: 850;
  letter-spacing: -0.02em;
  margin: 0.25rem 0 0.85rem;
}
.legal-body {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}
.legal-section p {
  color: hsl(var(--puka-ink-soft));
  line-height: 1.65;
}
.legal-h2 {
  font-size: 1.1rem;
  font-weight: 800;
  color: hsl(var(--puka-ink));
  margin-bottom: 0.35rem;
}
.legal-contact {
  margin-top: 0.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid hsl(var(--puka-ink) / 0.1);
  color: hsl(var(--puka-ink-soft));
}
</style>
