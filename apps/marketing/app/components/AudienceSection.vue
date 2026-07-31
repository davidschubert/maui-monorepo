<script setup lang="ts">
// Szene 8 — der soziale Spiegel (§6.4): „Menschen wie du". Identifikation statt
// Produkt-Liste; jede Karte führt auf ihre Anwendungsfall-Seite (Silo-SEO).
//
// DIE VIER SCHLÜSSEL KOMMEN AUS shared/, NICHT MEHR AUS i18n: bis 2026-07-31
// trug jeder i18n-Eintrag ein Feld `slug`, das in de.json und en.json denselben
// Wert hatte — es war also nie eine Übersetzung, sondern der kanonische
// Schlüssel an der falschen Stelle. Seit der Slug in der Adresse ÜBERSETZT ist
// (`kurse` ↔ `course-creators`), wäre es sogar eine Falle: ein dort gepflegter
// Wert würde entweder auf der einen Sprache ins Leere zeigen oder still die
// Weiterleitung auslösen. Reihenfolge der Karten = AUDIENCE_KEYS, die Texte
// liegen weiter als Liste in i18n (Index = Position im Katalog).
import { AUDIENCE_KEYS, audienceSlugForLocale } from '#shared/marketing'

const { t, locale } = useI18n()
const localePath = useLocalePath()

// An `locale` hängend (t und audienceSlugForLocale lesen beide die Sprache):
// beim Sprachwechsel rechnet der Abschnitt Texte UND Ziele neu.
const items = computed(() =>
  AUDIENCE_KEYS.map((key, i) => ({
    key,
    to: localePath({ name: 'use-cases-slug', params: { slug: audienceSlugForLocale(key, locale.value) } }),
    icon: t(`marketing.audience.items.${i}.icon`),
    title: t(`marketing.audience.items.${i}.title`),
    text: t(`marketing.audience.items.${i}.text`),
  })),
)
</script>

<template>
  <section id="fuer-wen" class="mkt-section tone-dawn-hold">
    <div class="mkt-inner mkt-narrow aud-head" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.audience.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.audience.title') }}</h2>
      <p class="mkt-lead">{{ t('marketing.audience.lead') }}</p>
    </div>

    <!-- Container und Raster getrennt — Begründung in BlocksSection.vue. -->
    <div class="mkt-inner" data-reveal>
      <UPageGrid class="mt-10 lg:grid-cols-4">
        <!-- `to` macht die GANZE Karte klickbar (Nuxt UI legt dafür einen
             Overlay-Link) — deshalb ist der „Mehr"-Pfeil unten ein span und
             kein zweiter Link im Link. Hover/Focus kommen von Nuxt UI. -->
        <UPageCard
          v-for="item in items" :key="item.key"
          :to="item.to"
          :icon="item.icon" :title="item.title" :description="item.text"
        >
          <template #footer>
            <span class="inline-flex items-center gap-1.5 text-sm font-bold text-primary-600">
              {{ t('marketing.audience.more') }}
              <UIcon name="i-ph-arrow-right-bold" class="size-4" />
            </span>
          </template>
        </UPageCard>
      </UPageGrid>
    </div>
  </section>
</template>

<style scoped>
.aud-head { text-align: center; }
.aud-head .mkt-lead { margin-inline: auto; }
</style>
