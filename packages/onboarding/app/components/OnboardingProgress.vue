<script setup lang="ts">
/**
 * Fortschritt des Setup-Flows.
 *
 * Bewusst als Balken MIT Zahl („Schritt 3 von 7") statt nur als Balken: die
 * Zahl ist das eigentliche Versprechen — sie sagt, dass es ein Ende gibt und
 * wie weit es weg ist. Ein nackter Balken lässt beides raten.
 *
 * `aria-*` statt Progress-Element, weil der Balken hier ein Zustand ist, kein
 * Ladevorgang; Screenreader lesen „Schritt 3 von 7".
 */
const props = defineProps<{ current: number, total: number, label: string }>()

const percent = computed(() => Math.round((props.current / props.total) * 100))
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-baseline justify-between gap-4">
      <p class="text-sm font-medium text-muted">{{ label }}</p>
      <p class="shrink-0 text-xs tabular-nums text-dimmed">{{ current }}/{{ total }}</p>
    </div>
    <div
      class="h-1.5 w-full overflow-hidden rounded-full bg-elevated"
      role="progressbar"
      :aria-valuenow="current"
      aria-valuemin="1"
      :aria-valuemax="total"
      :aria-label="label"
    >
      <div
        class="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
        :style="{ width: `${percent}%` }"
      />
    </div>
  </div>
</template>
