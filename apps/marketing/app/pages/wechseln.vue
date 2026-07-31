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

const ctaLinks = computed(() => [
  { to: start, color: 'primary' as const, size: 'xl' as const, label: t('marketing.hero.ctaPrimary') },
])

const ogImage = useOgImage('switch')

useSeoMeta({
  title: () => t('marketing.switch.metaTitle'),
  description: () => t('marketing.switch.metaDescription'),
  ogTitle: () => t('marketing.switch.metaTitle'),
  ogDescription: () => t('marketing.switch.metaDescription'),
  ogType: 'article',
  ogSiteName: 'Pukalani',
  ogImage: () => ogImage.value,
  twitterImage: () => ogImage.value,
})
</script>

<template>
  <div class="switch-page">
    <UPageHero
      as="section"
      class="tone-mist"
      :title="t('marketing.switch.title')"
      :description="t('marketing.switch.lead')"
      :ui="{ body: 'mt-8' }"
    >
      <template #top>
        <div class="switch-puka puka-glow" data-parallax="0.1" aria-hidden="true" />
      </template>
      <template #headline>
        <UButton
          :to="localePath('/')" variant="link" color="neutral" size="sm"
          icon="i-ph-arrow-left-bold"
          class="mb-5 px-0 font-semibold text-toned hover:text-primary-600"
          :label="t('marketing.audiencePages.backHome')"
        />
        <p class="mkt-kicker">{{ t('marketing.switch.kicker') }}</p>
      </template>

      <!-- Ehrlichkeit zuerst: der Import ist geplant, nicht geliefert.
           Dieser Hinweis steht VOR den Vorteilen und bleibt dort.
           `primary` (die Sonne), NICHT `warning`: der Bestand malte den
           Kasten in --puka-sun — Markenton, keine Warnung. -->
      <template #body>
        <UAlert
          color="primary" variant="subtle" icon="i-ph-info-bold"
          :description="t('marketing.switch.honest')"
          :ui="{
            title: 'text-base font-extrabold text-highlighted',
            description: 'text-base/relaxed opacity-100',
          }"
        >
          <template #title>
            <h2>{{ t('marketing.switch.honestTitle') }}</h2>
          </template>
        </UAlert>
      </template>
    </UPageHero>

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
        <!-- Häkchen-Liste = dieselbe Bauform wie in PrivacySection und auf den
             Produktseiten: UPageFeature (Icon + Zeile). Die Marketing-Seite
             hatte davon drei handgebaute Varianten. -->
        <ul class="mt-7 flex flex-col gap-2.5">
          <UPageFeature
            v-for="item in keep" :key="item"
            as="li" icon="i-ph-check-circle-fill" :title="item"
            :ui="{ leadingIcon: 'size-5 text-primary-600', title: 'font-semibold' }"
          />
        </ul>
      </div>
    </section>

    <!-- Der Vergleich gehört hierher: wer wechselt, will Zahlen sehen. -->
    <ComparisonSection />

    <UPageCTA
      as="section"
      class="tone-ink"
      :description="t('marketing.switch.ctaLead')"
      :links="ctaLinks"
    >
      <template #title>
        <PukaMark :size="38" class="mx-auto mb-3.5 block" />
        {{ t('marketing.switch.ctaTitle') }}
      </template>
    </UPageCTA>
  </div>
</template>

<style scoped>
/* Nur noch das Bildmotiv — Rhythmus und Typografie des Kopfes kommen aus dem
   `pageHero`-Vertrag in app/app.config.ts. */
.switch-puka { top: -16rem; left: -12rem; width: 34rem; height: 34rem; opacity: 0.55; }

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

@media (min-width: 700px) { .switch-steps { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1060px) { .switch-steps { grid-template-columns: repeat(4, 1fr); } }
</style>
