<script setup lang="ts">
/**
 * Deterministische Visual-Regression-Seite (Nachfolger des früheren
 * /styleguide, s. e2e/themes-visual.spec.ts): dieselben UI-Bausteine wie die
 * Startseite, aber OHNE Live-Daten — feste Zahlen, statischer Online-Badge,
 * Kommentar-Sektion auf einem ungenutzten Target (leerer Zustand). Die echte
 * Startseite ist als Screenshot-Ziel ungeeignet: Demo-Kommentare, Presence
 * und Zähler ändern sich laufend → jede Datenänderung riss alle 9
 * Theme-Baselines (Content-Drift, 2026-07-09).
 * Öffentlich erreichbar, aber noindex + nirgends verlinkt.
 */
const { t } = useI18n()

useSeoMeta({ title: 'Visual Regression', robots: 'noindex, nofollow' })

const features = [
  { icon: 'i-ph-lightning', key: 'realtime' },
  { icon: 'i-ph-palette', key: 'themes' },
  { icon: 'i-ph-globe', key: 'i18n' },
  { icon: 'i-ph-shield-check', key: 'admin' },
] as const

// Feste Anzeigewerte — niemals aus der DB
const stats = [
  { label: t('home.stats.comments'), value: '1.234' },
  { label: t('home.stats.members'), value: '56' },
  { label: t('home.stats.online'), value: '7' },
]
</script>

<template>
  <div class="space-y-12 py-4 sm:space-y-16 sm:py-8" data-visual-page>
    <!-- Hero (statisch, Badge immer sichtbar — kein Presence-Flackern) -->
    <section class="flex flex-col items-center text-center">
      <UBadge color="success" variant="subtle" class="mb-4">
        {{ t('home.onlineBadge', { count: 7 }) }}
      </UBadge>
      <h1 class="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
        {{ t('home.title') }}
      </h1>
      <p class="mt-4 max-w-xl text-lg text-muted">{{ t('home.subtitle') }}</p>
      <div class="mt-6 flex flex-wrap justify-center gap-3">
        <UButton size="lg">{{ t('home.ctaDemo') }}</UButton>
        <UButton size="lg" color="neutral" variant="subtle">{{ t('home.ctaDashboard') }}</UButton>
      </div>
    </section>

    <!-- Komponenten-Zoo: deckt die Token ab, die Themes verändern -->
    <section class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <UButton>Primary</UButton>
        <UButton color="neutral">Neutral</UButton>
        <UButton color="error" variant="soft">Soft</UButton>
        <UButton color="success" variant="subtle">Subtle</UButton>
        <UButton color="warning" variant="ghost">Ghost</UButton>
        <UButton variant="link">Link</UButton>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UBadge>Primary</UBadge>
        <UBadge color="neutral" variant="subtle">Neutral</UBadge>
        <UBadge color="error" variant="subtle">Error</UBadge>
        <UBadge color="warning" variant="subtle">Warning</UBadge>
        <UBadge color="info" variant="subtle">Info</UBadge>
      </div>
      <UAlert color="primary" variant="subtle" icon="i-ph-info" title="Alert" description="Theme-Token-Probe." />
      <div class="flex max-w-md gap-2">
        <UInput placeholder="Input" class="flex-1" />
        <UButton color="neutral" variant="subtle">OK</UButton>
      </div>
    </section>

    <!-- Feature-Karten (wie Startseite) -->
    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <UCard v-for="feature in features" :key="feature.key">
        <UIcon :name="feature.icon" class="mb-2 size-6 text-primary" />
        <h2 class="font-semibold">{{ t(`home.features.${feature.key}.title`) }}</h2>
        <p class="mt-1 text-sm text-muted">{{ t(`home.features.${feature.key}.text`) }}</p>
      </UCard>
    </section>

    <!-- Statistik mit FESTEN Zahlen -->
    <section class="grid grid-cols-3 gap-4">
      <div v-for="stat in stats" :key="stat.label" class="rounded-lg bg-elevated/50 p-4 text-center">
        <p class="text-2xl font-bold">{{ stat.value }}</p>
        <p class="text-sm text-muted">{{ stat.label }}</p>
      </div>
    </section>

    <!-- Kommentar-Sektion im LEEREN Zustand (Target existiert bewusst nicht;
         Formular + Empty-State sind theme-relevant und deterministisch) -->
    <section class="space-y-4">
      <CommentSection target-id="visual-regression-empty" target-type="visual" />
    </section>
  </div>
</template>
