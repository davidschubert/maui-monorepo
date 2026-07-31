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

        <aside class="gdpr-disclaimer">
          <h2 class="gdpr-disclaimer-title">{{ t('marketing.gdpr.disclaimerTitle') }}</h2>
          <p>{{ t('marketing.gdpr.disclaimer') }}</p>
          <!-- Die verbindliche Datenschutzerklärung liegt auf DIESER Domain
               (gleiche Begründung wie im Footer: Impressumspflicht). Der frühere
               Link auf app.pukalani.app war seit der Host-Entfernung 2026-07-27
               ein 404.
               Route-NAME statt Pfad-String: /datenschutz trägt je Locale einen
               eigenen Pfad (defineI18nRoute, EN /privacy) — ein roher Pfad
               bliebe auf EN deutsch und wäre wieder ein 404. -->
          <NuxtLink :to="localePath({ name: 'datenschutz' })" class="gdpr-legal-link">
            {{ t('marketing.gdpr.legalLink') }} <UIcon name="i-ph-arrow-right-bold" />
          </NuxtLink>
        </aside>
      </div>
    </section>

    <section class="mkt-section tone-sky">
      <ul class="gdpr-grid mkt-inner" data-reveal>
        <li v-for="section in sections" :key="section.title" class="gdpr-card">
          <span class="gdpr-ic"><UIcon :name="section.icon" /></span>
          <h2 class="gdpr-card-title">{{ section.title }}</h2>
          <p class="gdpr-card-text">{{ section.text }}</p>
        </li>
      </ul>
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
        <UButton :to="start" color="warning" size="xl" class="mkt-cta-btn">
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
.gdpr-disclaimer {
  margin-top: 2rem;
  padding: 1.25rem 1.4rem;
  background: hsl(0 0% 100% / 0.7);
  border-left: 3px solid hsl(var(--puka-sun));
  border-radius: 0.7rem;
  color: hsl(var(--puka-ink-soft));
  line-height: 1.6;
}
.gdpr-disclaimer-title { font-size: 1rem; font-weight: 800; color: hsl(var(--puka-ink)); margin-bottom: 0.4rem; }
.gdpr-legal-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.75rem;
  font-weight: 700;
  font-size: 0.92rem;
  color: hsl(var(--puka-sun-deep));
}
.gdpr-legal-link :deep(svg) { width: 0.9rem; height: 0.9rem; }

.gdpr-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.1rem;
  list-style: none;
  padding: 0;
  margin: 0;
}
.gdpr-card {
  padding: 1.5rem;
  border-radius: 1rem;
  background: hsl(0 0% 100% / 0.62);
  border: 1px solid hsl(var(--puka-ink) / 0.08);
}
.gdpr-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.3rem;
  height: 2.3rem;
  border-radius: 0.65rem;
  background: hsl(var(--puka-sun) / 0.18);
  color: hsl(var(--puka-sun-deep));
  margin-bottom: 0.85rem;
}
.gdpr-ic :deep(svg) { width: 1.25rem; height: 1.25rem; }
.gdpr-card-title { font-size: 1.1rem; font-weight: 800; margin-bottom: 0.35rem; }
.gdpr-card-text { color: hsl(var(--puka-ink-soft)); line-height: 1.6; }

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

@media (min-width: 700px) { .gdpr-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1060px) { .gdpr-grid { grid-template-columns: repeat(3, 1fr); } }
</style>
