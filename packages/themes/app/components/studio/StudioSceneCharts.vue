<script setup lang="ts">
/**
 * Szene „Diagramme": zeigt, ob die Ramp als DATENPALETTE taugt — Balken in
 * den Stufen 300–700, Verteilungsbalken über die Ramp und eine Linie in
 * --ui-primary. Beispieldaten, Farben kommen komplett aus den CSS-Variablen
 * (reagieren live auf Theme/Draft, kein JS nötig).
 */
const { t } = useI18n()

// Beispieldaten: Balkenhöhe in % + Ramp-Stufe als Datenfarbe
const bars = [
  { value: 45, shade: 300 },
  { value: 72, shade: 400 },
  { value: 58, shade: 500 },
  { value: 86, shade: 600 },
  { value: 39, shade: 700 },
  { value: 64, shade: 500 },
  { value: 51, shade: 400 },
] as const

const distribution = [
  { shade: 300, share: 14 },
  { shade: 400, share: 22 },
  { shade: 500, share: 31 },
  { shade: 600, share: 21 },
  { shade: 700, share: 12 },
] as const

const LINE_POINTS = '0,34 18,26 36,29 54,18 72,22 90,10 108,14 126,6'
</script>

<template>
  <div class="min-w-0 space-y-4">
    <div class="grid min-w-0 gap-3 sm:grid-cols-2">
      <!-- Balken (Ramp-Stufen als Datenfarben) -->
      <UPageCard variant="subtle" :ui="{ container: 'min-w-0 p-4 sm:p-4' }">
        <p class="mb-3 text-xs text-muted">{{ t('themes.studio.scenes.chartBars') }}</p>
        <div class="flex h-36 items-end gap-2">
          <div
            v-for="(bar, i) in bars"
            :key="i"
            class="flex-1 rounded-t-md"
            :style="{ height: `${bar.value}%`, backgroundColor: `var(--ui-color-primary-${bar.shade})` }"
          />
        </div>
      </UPageCard>

      <!-- Linie in --ui-primary -->
      <UPageCard variant="subtle" :ui="{ container: 'min-w-0 p-4 sm:p-4' }">
        <p class="mb-3 text-xs text-muted">{{ t('themes.studio.scenes.chartLine') }}</p>
        <svg viewBox="0 0 126 40" class="h-36 w-full" aria-hidden="true" preserveAspectRatio="none">
          <polygon
            :points="`0,40 ${LINE_POINTS} 126,40`"
            fill="var(--ui-color-primary-500)"
            opacity="0.15"
          />
          <polyline
            :points="LINE_POINTS"
            fill="none"
            stroke="var(--ui-primary)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </UPageCard>
    </div>

    <!-- Verteilung über die Ramp -->
    <UPageCard variant="subtle" :ui="{ container: 'min-w-0 p-4 sm:p-4' }">
      <p class="mb-3 text-xs text-muted">{{ t('themes.studio.scenes.chartDistribution') }}</p>
      <div class="flex h-5 w-full overflow-hidden rounded-md">
        <div
          v-for="seg in distribution"
          :key="seg.shade"
          :style="{ width: `${seg.share}%`, backgroundColor: `var(--ui-color-primary-${seg.shade})` }"
        />
        <div class="flex-1 bg-elevated" />
      </div>
      <div class="mt-2 flex flex-wrap gap-3">
        <span v-for="seg in distribution" :key="seg.shade" class="inline-flex items-center gap-1.5 text-xs text-muted">
          <span class="size-2.5 rounded-full" :style="{ backgroundColor: `var(--ui-color-primary-${seg.shade})` }" />
          {{ seg.shade }}
        </span>
      </div>
    </UPageCard>

    <p class="text-xs text-dimmed">{{ t('themes.studio.scenes.chartsHint') }}</p>
  </div>
</template>
