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
      <!-- Dasselbe Bauteil wie die drei Schritte auf der Startseite:
           `UPageGrid` + `UPageCard` mit der Nummern-Scheibe im `#leading`-Slot
           (Begründung gegen `UStepper`/`UTimeline` steht in StepsSection.vue).
           `mkt-inner` und das Raster bleiben zwei Elemente — `.mkt-inner`
           setzt `margin: 0 auto` als ungeschichtete Kurzform und schlägt jede
           Tailwind-Utility. Nur BENANNTE Stufen, aus demselben Grund wie in
           StepsSection.vue (arbiträre `min-[…]`-Regeln stehen in Tailwinds
           Ausgabe vor den benannten und verlieren gegen das nötige `sm:`).
           Bewusste Abweichung: der Bestand schaltete bei 700px auf zwei und bei
           1060px auf vier Spalten, hier tut er es bei 768 und 1024. -->
      <div class="mkt-inner" data-reveal>
        <UPageGrid as="ol" class="mt-8 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <UPageCard
            v-for="step in steps" :key="step.n"
            as="li"
            :title="step.title" :description="step.text"
            :ui="{ leading: 'mb-[0.8rem]' }"
          >
            <template #leading>
              <span class="inline-flex size-[2.2rem] items-center justify-center rounded-full bg-[image:var(--puka-step-fill)] font-extrabold text-inverted">
                {{ step.n }}
              </span>
            </template>
          </UPageCard>
        </UPageGrid>
      </div>
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
</style>
