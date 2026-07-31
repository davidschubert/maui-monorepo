<script setup lang="ts">
// Trust-Seite (§3.1): EN /gdpr · DE /de/dsgvo (echte englische URL statt
// deutschem Pfad — defineI18nRoute mappt je Locale).
//
// WICHTIG (§2.4 + §4.7): Diese Seite erklärt Technik und Betrieb — sie gibt
// KEINE pauschale „DSGVO-konform"- oder „kein Cookie-Banner"-Zusage und
// verspricht keine Backup-/Restore-Garantie. Der Abschnitt „Was wir bewusst
// nicht versprechen" ist Teil der Botschaft, nicht ein Zugeständnis.
definePageMeta({ layout: 'site' })
defineI18nRoute({
  paths: { en: '/gdpr', de: '/dsgvo' },
})

const { t } = useI18n()
const localePath = useLocalePath()
const { start } = useProductLinks()
useReveal()

const sections = computed(() =>
  [0, 1, 2, 3, 4, 5].map(i => ({
    icon: t(`marketing.gdpr.sections.${i}.icon`),
    title: t(`marketing.gdpr.sections.${i}.title`),
    text: t(`marketing.gdpr.sections.${i}.text`),
  })),
)
const notPromised = computed(() =>
  [0, 1, 2].map(i => ({
    claim: t(`marketing.gdpr.notPromised.${i}.claim`),
    why: t(`marketing.gdpr.notPromised.${i}.why`),
  })),
)

const ogImage = useOgImage('gdpr')

useSeoMeta({
  title: () => t('marketing.gdpr.metaTitle'),
  description: () => t('marketing.gdpr.metaDescription'),
  ogTitle: () => t('marketing.gdpr.metaTitle'),
  ogDescription: () => t('marketing.gdpr.metaDescription'),
  ogType: 'article',
  ogSiteName: 'Pukalani',
  ogImage: () => ogImage.value,
  twitterImage: () => ogImage.value,
})
</script>

<template>
  <div class="gdpr-page">
    <section class="gdpr-hero tone-mist">
      <div class="gdpr-puka puka-glow" data-parallax="0.1" aria-hidden="true" />
      <div class="mkt-inner mkt-narrow gdpr-hero-inner" data-reveal>
        <NuxtLink :to="localePath('/')" class="mkt-back">
          <UIcon name="i-ph-arrow-left-bold" /> {{ t('marketing.audiencePages.backHome') }}
        </NuxtLink>
        <p class="mkt-kicker">{{ t('marketing.gdpr.kicker') }}</p>
        <h1 class="gdpr-title">{{ t('marketing.gdpr.title') }}</h1>
        <p class="mkt-lead">{{ t('marketing.gdpr.lead') }}</p>

        <UAlert
          color="primary" variant="subtle"
          class="mt-8"
          :ui="{
            title: 'text-base font-extrabold text-highlighted',
            description: 'text-base/relaxed opacity-100',
          }"
        >
          <template #title>
            <h2>{{ t('marketing.gdpr.disclaimerTitle') }}</h2>
          </template>
          <template #description>
            <p>{{ t('marketing.gdpr.disclaimer') }}</p>
            <!-- Die verbindliche Datenschutzerklärung liegt auf DIESER Domain
                 (gleiche Begründung wie im Footer: Impressumspflicht). Der frühere
                 Link auf app.pukalani.app war seit der Host-Entfernung 2026-07-27
                 ein 404.
                 Route-NAME statt Pfad-String: /datenschutz trägt je Locale einen
                 eigenen Pfad (defineI18nRoute, EN /privacy) — ein roher Pfad
                 bliebe auf EN deutsch und wäre wieder ein 404. -->
            <ULink
              :to="localePath({ name: 'datenschutz' })"
              class="mt-3 inline-flex items-center gap-1.5 text-[0.92rem] font-bold text-primary-600"
            >
              {{ t('marketing.gdpr.legalLink') }}
              <UIcon name="i-ph-arrow-right-bold" class="size-4" />
            </ULink>
          </template>
        </UAlert>
      </div>
    </section>

    <section class="mkt-section tone-sky">
      <div class="mkt-inner" data-reveal>
        <UPageGrid as="ul">
          <UPageCard
            v-for="section in sections" :key="section.title"
            as="li" :icon="section.icon" :description="section.text"
            :ui="{
              leading: 'size-[2.3rem] shrink-0 justify-center rounded-[0.65rem] bg-primary/20 mb-3.5',
              leadingIcon: 'size-5 text-primary-600',
            }"
          >
            <!-- Die Abschnitts-Überschrift bleibt eine echte h2 (SEO/Struktur)
                 — der title-Slot trägt nur die Optik. -->
            <template #title>
              <h2>{{ section.title }}</h2>
            </template>
          </UPageCard>
        </UPageGrid>
      </div>
    </section>

    <section class="mkt-section tone-dawn">
      <div class="mkt-inner mkt-narrow" data-reveal>
        <h2 class="mkt-h2">{{ t('marketing.gdpr.notPromisedTitle') }}</h2>
        <p class="mkt-lead">{{ t('marketing.gdpr.notPromisedLead') }}</p>
        <dl class="np-list">
          <div v-for="item in notPromised" :key="item.claim" class="np-item">
            <dt class="np-claim"><UIcon name="i-ph-prohibit-bold" /> {{ item.claim }}</dt>
            <dd class="np-why">{{ item.why }}</dd>
          </div>
        </dl>
      </div>
    </section>

    <section class="mkt-cta-block tone-ink">
      <div class="mkt-inner mkt-narrow mkt-cta-inner" data-reveal>
        <PukaMark :size="38" />
        <h2 class="mkt-cta-title">{{ t('marketing.gdpr.ctaTitle') }}</h2>
        <p class="mkt-cta-lead">{{ t('marketing.gdpr.ctaLead') }}</p>
        <UButton :to="start" color="primary" size="xl" class="mkt-cta-btn">
          {{ t('marketing.hero.ctaPrimary') }}
        </UButton>
      </div>
    </section>
  </div>
</template>

<style scoped>
.gdpr-hero {
  position: relative;
  padding: clamp(3rem, 7vw, 5.5rem) 1.5rem clamp(2.5rem, 5vw, 4rem);
  overflow: clip;
}
.gdpr-puka { top: -16rem; right: -12rem; width: 34rem; height: 34rem; opacity: 0.55; }
.gdpr-hero-inner { position: relative; }
.gdpr-title {
  font-size: clamp(1.9rem, 4.6vw, 3rem);
  font-weight: 850;
  letter-spacing: -0.02em;
  line-height: 1.06;
  margin: 0.5rem 0 1rem;
  text-wrap: balance;
}
/* Die „Was wir bewusst nicht versprechen"-Liste bleibt BEWUSST handgebaut:
   sie ist eine Definitionsliste (dl/dt/dd), und ein UPageCard schöbe zwischen
   <dl> und <dt> zwei weitere <div> — das ist im dl-Modell nicht erlaubt. */
.np-list { margin: 2rem 0 0; display: flex; flex-direction: column; gap: 1rem; }
.np-item {
  padding: 1.25rem 1.4rem;
  border-radius: 0.9rem;
  background: hsl(0 0% 100% / 0.55);
  border: 1px solid hsl(var(--puka-ink) / 0.08);
}
.np-claim {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 800;
  color: hsl(var(--puka-ink));
  margin-bottom: 0.35rem;
}
.np-claim :deep(svg) { width: 1.1rem; height: 1.1rem; color: hsl(var(--puka-ink-soft) / 0.6); flex: none; }
.np-why { color: hsl(var(--puka-ink-soft)); line-height: 1.6; margin: 0; }
</style>
