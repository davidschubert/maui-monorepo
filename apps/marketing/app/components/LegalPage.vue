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
        <NuxtLink :to="localePath('/')" class="mkt-back">
          <UIcon name="i-ph-arrow-left-bold" /> {{ t('marketing.legal.backHome') }}
        </NuxtLink>
        <h1 class="legal-title">{{ t(`${base}.title`) }}</h1>
        <p class="mkt-lead">{{ t(`${base}.lead`) }}</p>

        <aside class="legal-draft">
          <span class="legal-draft-badge">
            <UIcon name="i-ph-warning-bold" /> {{ t('marketing.legal.draftBadge') }}
          </span>
          <p>{{ t('marketing.legal.draftNote') }}</p>
        </aside>

        <!-- Von der verbindlichen Datenschutzerklärung zur technischen
             Erklärseite verlinken (und nur dort). Route-NAME statt Pfad-String
             (Regel in MarketingFooter.vue): EN liegt sie unter /gdpr. -->
        <p v-if="scope === 'privacy'" class="legal-seealso">
          <NuxtLink :to="localePath({ name: 'dsgvo' })">
            {{ t('marketing.legal.privacy.seeAlso') }} <UIcon name="i-ph-arrow-right-bold" />
          </NuxtLink>
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
.legal-draft {
  margin-top: 1.75rem;
  padding: 1.2rem 1.35rem;
  background: hsl(var(--puka-sun) / 0.14);
  border-left: 3px solid hsl(var(--puka-sun-deep));
  border-radius: 0.7rem;
  color: hsl(var(--puka-ink) / 0.85);
  line-height: 1.6;
}
.legal-draft-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 800;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: hsl(var(--puka-sun-deep));
  margin-bottom: 0.5rem;
}
.legal-draft-badge :deep(svg) { width: 1.05rem; height: 1.05rem; }
.legal-seealso { margin-top: 1.25rem; }
.legal-seealso a {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 700;
  color: hsl(var(--puka-sun-deep));
}
.legal-seealso :deep(svg) { width: 0.9rem; height: 0.9rem; }

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
