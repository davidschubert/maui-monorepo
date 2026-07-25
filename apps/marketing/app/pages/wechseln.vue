<script setup lang="ts">
// Umzugsseite (§3.1): EN /switch · DE /de/wechseln. Abwerbe-Keywords („von
// Circle wechseln"), aber OHNE Importer-Zusage: Import/Export-Automatik ist im
// Claim-Inventar (§2.4) als GEPLANT geführt — deshalb steht der ehrliche
// Hinweis ganz oben, nicht im Kleingedruckten.
definePageMeta({ layout: 'site' })
defineI18nRoute({
  paths: { en: '/switch', de: '/wechseln' },
})

const { t } = useI18n()
const localePath = useLocalePath()
const { start } = useProductLinks()
useReveal()

const steps = computed(() =>
  [0, 1, 2, 3].map(i => ({
    n: t(`marketing.switch.steps.${i}.n`),
    title: t(`marketing.switch.steps.${i}.title`),
    text: t(`marketing.switch.steps.${i}.text`),
  })),
)
const keep = computed(() => [0, 1, 2, 3].map(i => t(`marketing.switch.keep.${i}`)))

useSeoMeta({
  title: () => t('marketing.switch.metaTitle'),
  description: () => t('marketing.switch.metaDescription'),
  ogTitle: () => t('marketing.switch.metaTitle'),
  ogDescription: () => t('marketing.switch.metaDescription'),
  ogType: 'article',
  ogSiteName: 'Pukalani',
})
</script>

<template>
  <div class="switch-page">
    <section class="switch-hero tone-mist">
      <div class="switch-puka puka-glow" data-parallax="0.1" aria-hidden="true" />
      <div class="mkt-inner mkt-narrow switch-hero-inner" data-reveal>
        <NuxtLink :to="localePath('/')" class="mkt-back">
          <UIcon name="i-ph-arrow-left-bold" /> {{ t('marketing.audiencePages.backHome') }}
        </NuxtLink>
        <p class="mkt-kicker">{{ t('marketing.switch.kicker') }}</p>
        <h1 class="switch-title">{{ t('marketing.switch.title') }}</h1>
        <p class="mkt-lead">{{ t('marketing.switch.lead') }}</p>

        <!-- Ehrlichkeit zuerst: der Import ist geplant, nicht geliefert. -->
        <aside class="switch-honest">
          <h2 class="switch-honest-title">
            <UIcon name="i-ph-info-bold" /> {{ t('marketing.switch.honestTitle') }}
          </h2>
          <p>{{ t('marketing.switch.honest') }}</p>
        </aside>
      </div>
    </section>

    <section class="mkt-section tone-sky">
      <div class="mkt-inner mkt-narrow" data-reveal>
        <h2 class="mkt-h2">{{ t('marketing.switch.stepsTitle') }}</h2>
      </div>
      <ol class="switch-steps mkt-inner" data-reveal>
        <li v-for="step in steps" :key="step.n" class="switch-step">
          <span class="switch-num">{{ step.n }}</span>
          <h3 class="switch-step-title">{{ step.title }}</h3>
          <p class="switch-step-text">{{ step.text }}</p>
        </li>
      </ol>
    </section>

    <section class="mkt-section tone-dawn">
      <div class="mkt-inner mkt-narrow" data-reveal>
        <h2 class="mkt-h2">{{ t('marketing.switch.keepTitle') }}</h2>
        <ul class="switch-keep">
          <li v-for="item in keep" :key="item">
            <UIcon name="i-ph-check-circle-fill" /> <span>{{ item }}</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- Der Vergleich gehört hierher: wer wechselt, will Zahlen sehen. -->
    <ComparisonSection />

    <section class="mkt-cta-block tone-ink">
      <div class="mkt-inner mkt-narrow mkt-cta-inner" data-reveal>
        <PukaMark :size="38" />
        <h2 class="mkt-cta-title">{{ t('marketing.switch.ctaTitle') }}</h2>
        <p class="mkt-cta-lead">{{ t('marketing.switch.ctaLead') }}</p>
        <UButton :to="start" color="warning" size="xl" class="mkt-cta-btn">
          {{ t('marketing.hero.ctaPrimary') }}
        </UButton>
      </div>
    </section>
  </div>
</template>

<style scoped>
.switch-hero {
  position: relative;
  padding: clamp(3rem, 7vw, 5.5rem) 1.5rem clamp(2.5rem, 5vw, 4rem);
  overflow: clip;
}
.switch-puka { top: -16rem; left: -12rem; width: 34rem; height: 34rem; opacity: 0.55; }
.switch-hero-inner { position: relative; }
.switch-title {
  font-size: clamp(1.9rem, 4.6vw, 3rem);
  font-weight: 850;
  letter-spacing: -0.02em;
  line-height: 1.06;
  margin: 0.5rem 0 1rem;
  text-wrap: balance;
}
.switch-honest {
  margin-top: 2rem;
  padding: 1.25rem 1.4rem;
  background: hsl(0 0% 100% / 0.7);
  border-left: 3px solid hsl(var(--puka-sun));
  border-radius: 0.7rem;
  color: hsl(var(--puka-ink-soft));
  line-height: 1.6;
}
.switch-honest-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1rem;
  font-weight: 800;
  color: hsl(var(--puka-ink));
  margin-bottom: 0.4rem;
}
.switch-honest-title :deep(svg) { width: 1.1rem; height: 1.1rem; color: hsl(var(--puka-sun-deep)); }

.switch-steps {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.1rem;
  margin: 2rem 0 0;
  padding: 0;
  list-style: none;
}
.switch-step {
  padding: 1.4rem;
  border-radius: 1rem;
  background: hsl(0 0% 100% / 0.6);
  border: 1px solid hsl(var(--puka-ink) / 0.08);
}
.switch-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 50%;
  font-weight: 800;
  color: hsl(0 0% 100%);
  background: linear-gradient(135deg, hsl(var(--puka-sun)), hsl(var(--puka-sun-deep)));
  margin-bottom: 0.8rem;
}
.switch-step-title { font-size: 1.08rem; font-weight: 800; margin-bottom: 0.3rem; }
.switch-step-text { color: hsl(var(--puka-ink-soft)); line-height: 1.55; }

.switch-keep {
  margin: 1.75rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.switch-keep li {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  font-weight: 600;
  color: hsl(var(--puka-ink));
  line-height: 1.5;
}
.switch-keep :deep(svg) {
  width: 1.2rem;
  height: 1.2rem;
  flex: none;
  margin-top: 0.1rem;
  color: hsl(var(--puka-sun-deep));
}

@media (min-width: 700px) { .switch-steps { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1060px) { .switch-steps { grid-template-columns: repeat(4, 1fr); } }
</style>
