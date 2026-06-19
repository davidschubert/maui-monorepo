<script setup lang="ts">
import type { AnalyticsPoint } from '../../shared/types/admin'

const props = defineProps<{
  points: AnalyticsPoint[]
  usersLabel: string
  commentsLabel: string
}>()

const W = 720
const H = 240
const PAD = 28

const max = computed(() => Math.max(1, ...props.points.flatMap(p => [p.users, p.comments])))
const count = computed(() => props.points.length)

function px(i: number): number {
  return count.value <= 1 ? PAD : PAD + (i / (count.value - 1)) * (W - 2 * PAD)
}
function py(value: number): number {
  return H - PAD - (value / max.value) * (H - 2 * PAD)
}
function polyline(key: 'users' | 'comments'): string {
  return props.points.map((p, i) => `${px(i).toFixed(1)},${py(p[key]).toFixed(1)}`).join(' ')
}
function areaPath(key: 'users' | 'comments'): string {
  if (count.value === 0) return ''
  return `M ${px(0).toFixed(1)},${(H - PAD).toFixed(1)} L ${polyline(key)} L ${px(count.value - 1).toFixed(1)},${(H - PAD).toFixed(1)} Z`
}

const usersLine = computed(() => polyline('users'))
const commentsLine = computed(() => polyline('comments'))
const usersArea = computed(() => areaPath('users'))

const { locale } = useI18n()
function labelDate(date: string): string {
  if (!date) return ''
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale.value, { weekday: 'short', day: '2-digit', month: '2-digit' })
}
const firstDate = computed(() => labelDate(props.points[0]?.date ?? ''))
const lastDate = computed(() => labelDate(props.points.at(-1)?.date ?? ''))
</script>

<template>
  <div class="w-full">
    <svg :viewBox="`0 0 ${W} ${H}`" class="h-auto w-full" role="img">
      <!-- Baseline + Mittellinie -->
      <line :x1="PAD" :y1="H - PAD" :x2="W - PAD" :y2="H - PAD" class="text-default" stroke="currentColor" stroke-width="1" opacity="0.4" />
      <line :x1="PAD" :y1="(H - PAD) / 1.0 - (H - 2 * PAD) / 2" :x2="W - PAD" :y2="(H - PAD) - (H - 2 * PAD) / 2" class="text-default" stroke="currentColor" stroke-width="1" stroke-dasharray="3 4" opacity="0.25" />

      <!-- Users: gefüllte Fläche + Linie (primary) -->
      <path :d="usersArea" class="text-primary" fill="currentColor" opacity="0.08" />
      <polyline :points="usersLine" class="text-primary" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />

      <!-- Comments: Linie (info) -->
      <polyline :points="commentsLine" class="text-info" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />

      <!-- Y-Achse: Max oben, 0 unten (theme-fähige Farbe via currentColor) -->
      <text :x="PAD" :y="PAD - 8" fill="currentColor" class="text-dimmed text-[11px]">{{ max }}</text>
      <text :x="PAD" :y="H - PAD + 16" fill="currentColor" class="text-dimmed text-[11px]">0</text>
    </svg>

    <div class="mt-2 flex items-center justify-between text-xs text-muted">
      <div class="flex items-center gap-4">
        <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-primary" />{{ usersLabel }}</span>
        <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-info" />{{ commentsLabel }}</span>
      </div>
      <span class="font-mono">{{ firstDate }} – {{ lastDate }}</span>
    </div>
  </div>
</template>
