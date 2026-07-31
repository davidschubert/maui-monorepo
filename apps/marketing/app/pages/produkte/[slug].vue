<script setup lang="ts">
// Produkt-Cluster-Seiten (§3.1): diskussionen · moderation · branding ·
// beitraege · kurse · events.
//
// Claim-Gate-Umsetzung (§2.4, Entscheidung David 2026-07-24): Kurse und Events
// SIND Early Access. Ihre Seiten existieren, aber sie dürfen nicht wie ein
// aktueller Tarifbestandteil aussehen. Deshalb:
//   1. ein prominenter Early-Access-Banner GANZ OBEN (nicht kleingedruckt),
//   2. KEIN Kauf-/„Kostenlos starten"-CTA — nur „Early Access anfragen",
//   3. die Highlights beschreiben ausschließlich, was tatsächlich existiert.
//
// Locale-Pfade: EN /products/<en-slug> · DE /de/produkte/<de-slug> —
// Kundensprache ist „Produkte" (im CODE bleibt das Vokabular `products`).
// Seit Davids Entscheidung 2026-07-31 ist NICHT NUR das Segment übersetzt,
// sondern auch der Slug (/de/produkte/kurse ↔ /products/courses).
// Die alten /features/*-URLs und die drei EN-Adressen mit deutschem Slug waren
// schon veröffentlicht: 301 in nuxt.config.ts.
import { EARLY_ACCESS_KEYS, keyFromSlug, slugForLocale } from '#shared/marketing'

definePageMeta({ layout: 'site' })
defineI18nRoute({ paths: { en: '/products/[slug]', de: '/produkte/[slug]' } })

// Beide Kataloge stehen in shared/marketing.ts: dieselbe Quelle baut die
// Sitemap (server/utils/marketingRoutes.ts) und die Link-Ziele in Kopf und Fuß,
// und die Early-Access-Liste ist ein Claim-Gate (§2.4) — sie darf nicht in
// zwei Fassungen existieren.
const route = useRoute()
const { t, locale } = useI18n()

/**
 * Der Slug in der Adresse gehört der AKTUELLEN Sprache; gearbeitet wird ab
 * hier nur noch mit dem kanonischen Schlüssel (i18n-Texte, OG-Bild,
 * Claim-Gate). Ein Slug der ANDEREN Sprache ist kein Treffer — `keyFromSlug`
 * prüft je Sprache, sonst gäbe es dieselbe Seite unter zwei URLs.
 */
const productKey = keyFromSlug(String(route.params.slug), locale.value)
if (!productKey) {
  throw createError({ status: 404, statusText: 'Page not found' })
}

/**
 * DIE ÜBERSETZTE ADRESSE DIESER SEITE — für `switchLocalePath()` (Sprach-
 * wechsler im Fuß) UND für die hreflang-Alternates aus `useLocaleSeoHead()`.
 *
 * Ohne diesen Aufruf kennt @nuxtjs/i18n nur den Routen-NAMEN und reicht die
 * Parameter unverändert weiter: aus `/de/produkte/kurse` würde `/products/
 * kurse` — eine Adresse, die es nicht mehr gibt (301 → `/products/courses`).
 * Der Sprachwechsel liefe also über eine Weiterleitung, und die
 * `alternate`-Links wiesen Google auf Weiterleitungen statt auf Seiten.
 *
 * `useSetI18nParams()` GIBT die Setz-Funktion ZURÜCK (die Argumente des
 * Composables selbst sind SEO-Optionen) — der zweite Aufruf ist Absicht.
 * Er patcht zugleich den Kopf: weil diese Seite TIEFER im Baum sitzt als die
 * `app.vue` mit `useLocaleSeoHead()`, gewinnen seine `alternate`/`canonical`-
 * Einträge beim Zusammenführen in unhead (gleicher Dedupe-Schlüssel, spätere
 * Registrierung).
 */
const setI18nParams = useSetI18nParams()
setI18nParams({
  de: { slug: slugForLocale(productKey, 'de') },
  en: { slug: slugForLocale(productKey, 'en') },
})

const HIGHLIGHT_COUNT = 6
const localePath = useLocalePath()
const { start, demo, signIn } = useProductLinks()
useReveal()

const isEarlyAccess = computed(() => EARLY_ACCESS_KEYS.includes(productKey))

const base = `marketing.products.items.${productKey}`
const highlights = computed(() =>
  Array.from({ length: HIGHLIGHT_COUNT }, (_, i) => t(`${base}.highlights.${i}`)),
)

/**
 * Claim-Gate im Abschluss-CTA (§2.4): auf einer Early-Access-Seite gibt es
 * KEINEN Kauf-/Gratis-Knopf, sondern nur „Early Access anfragen". Die
 * Verzweigung ist deshalb hier — eine Liste, zwei mögliche erste Einträge —
 * und nicht ein `v-if` an einem Knopf im Markup: so kann kein späterer
 * Umbau den Gratis-Knopf versehentlich wieder danebenstellen.
 */
const ctaLinks = computed(() => [
  isEarlyAccess.value
    ? { to: signIn, color: 'primary' as const, size: 'xl' as const, label: t('marketing.products.eaCta') }
    : { to: start, color: 'primary' as const, size: 'xl' as const, label: t('marketing.hero.ctaPrimary') },
  {
    to: demo,
    color: 'neutral' as const,
    variant: 'ghost' as const,
    size: 'xl' as const,
    icon: 'i-ph-play-circle',
    label: t('marketing.hero.ctaSecondary'),
  },
])

// Das OG-Bild trägt den KANONISCHEN Schlüssel (`products-beitraege-en.jpg`,
// nicht `products-posts-en.jpg`) — bewusst kein Datei-Rename: eine Bild-URL ist
// keine Navigations-URL. Sie steht nur im <head>, niemand liest oder verlinkt
// sie, und ein Rename hieße neue Dateien, eine angepasste scripts/og-images.mjs
// und tote Adressen in schon geteilten Vorschauen — für null Wirkung.
useMarketingSeo({
  titleKey: `${base}.metaTitle`,
  descriptionKey: `${base}.metaDescription`,
  image: `products-${productKey}`,
})
</script>

<template>
  <div class="feat-page">
    <UPageHero
      as="section"
      class="tone-mist"
      :title="t(`${base}.title`)"
      :ui="{ body: 'mt-8', description: 'max-w-none' }"
    >
      <template #top>
        <div class="feat-puka puka-glow" data-parallax="0.1" aria-hidden="true" />
      </template>
      <template #headline>
        <UButton
          :to="localePath('/')" variant="link" color="neutral" size="sm"
          icon="i-ph-arrow-left-bold"
          class="mb-5 px-0 font-semibold text-toned hover:text-primary-600"
          :label="t('marketing.products.backHome')"
        />
        <p class="mkt-kicker">{{ t(`${base}.name`) }}</p>
      </template>

      <!-- Diese Seite hat ZWEI Zeilen unter der Überschrift: eine farbige
           Unterzeile (`sub`) und den eigentlichen Lead (`intro`). Zwischen
           Titel und Beschreibung gibt es keinen Slot, also stehen beide IM
           `#description`-Slot: Schriftgröße, Zeilenhöhe und Breite kommen
           dann für beide aus dem `pageHero`-Vertrag, die Unterzeile dreht nur
           Gewicht und Farbe. -->
      <template #description>
        <p class="mb-5 font-semibold text-primary-600">{{ t(`${base}.sub`) }}</p>
        <p class="max-w-[42rem]">{{ t(`${base}.intro`) }}</p>
      </template>

      <!-- Early Access: der Hinweis steht VOR den Vorteilen, nicht danach —
           prominent GANZ OBEN, mit Titel und Text, nicht kleingedruckt. -->
      <template v-if="isEarlyAccess" #body>
        <UAlert
          color="primary" variant="subtle" icon="i-ph-seal-warning-bold"
          :description="t('marketing.products.eaBannerText')"
          :ui="{
            title: 'text-[0.95rem] font-extrabold uppercase tracking-wide',
            description: 'text-base/relaxed opacity-100',
          }"
        >
          <template #title>
            <h2>{{ t('marketing.products.eaBannerTitle') }}</h2>
          </template>
        </UAlert>
      </template>
    </UPageHero>

    <section class="mkt-section tone-sky">
      <div class="mkt-inner mkt-narrow" data-reveal>
        <h2 class="mkt-h2">{{ t('marketing.products.highlightsTitle') }}</h2>
        <!-- Häkchen-Liste = dieselbe Bauform wie auf /wechseln und in
             PrivacySection: UPageFeature (Icon + Zeile). -->
        <ul class="mt-7 flex flex-col gap-2.5">
          <UPageFeature
            v-for="item in highlights" :key="item"
            as="li" icon="i-ph-check-circle-fill" :title="item"
            :ui="{ leadingIcon: 'size-5 text-primary-600', title: 'font-medium' }"
          />
        </ul>
      </div>
    </section>

    <!-- Bausteine-Übersicht: gleiche Claim-Gates wie überall -->
    <BlocksSection />

    <UPageCTA
      as="section"
      class="tone-ink"
      :description="isEarlyAccess ? t('marketing.products.eaBannerText') : t('marketing.products.ctaLead')"
      :links="ctaLinks"
    >
      <template #title>
        <PukaMark :size="38" class="mx-auto mb-3.5 block" />
        {{ isEarlyAccess ? t('marketing.products.eaBannerTitle') : t('marketing.products.ctaTitle') }}
      </template>
    </UPageCTA>
  </div>
</template>

<style scoped>
/* Nur noch das Bildmotiv — Rhythmus und Typografie des Kopfes kommen aus dem
   `pageHero`-Vertrag in app/app.config.ts. */
.feat-puka { top: -16rem; right: -12rem; width: 34rem; height: 34rem; opacity: 0.55; }
</style>
