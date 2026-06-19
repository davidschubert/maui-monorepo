<script setup lang="ts">
import type { AnalyticsPoint } from '../../shared/types/admin'

const props = defineProps<{
  points: AnalyticsPoint[]
  usersLabel: string
  commentsLabel: string
  usersTotal: number
  commentsTotal: number
  todayLabel: string
}>()

const { locale } = useI18n()

const W = 720
const H = 220
const PAD = 26

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

function shortDate(date: string): string {
  if (!date) return ''
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale.value, { day: '2-digit', month: '2-digit' })
}

// ~5 gleichmäßig verteilte X-Achsen-Beschriftungen, letzte = "Heute"
const xTicks = computed(() => {
  const n = count.value
  if (n === 0) return []
  const idxs = [...new Set([0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1])]
  return idxs.map(i => (i === n - 1 ? props.todayLabel : shortDate(props.points[i]?.date ?? '')))
})
</script>

<template>
  <div class="w-full">
    <svg :viewBox="`0 0 ${W} ${H}`" class="h-auto w-full" role="img">
      <!-- Baseline -->
      <line :x1="PAD" :y1="H - PAD" :x2="W - PAD" :y2="H - PAD" class="text-default" stroke="currentColor" stroke-width="1" opacity="0.4" />

      <!-- Users: gefüllte Fläche + Linie (primary) -->
      <path :d="usersArea" class="text-primary" fill="currentColor" opacity="0.08" />
      <polyline :points="usersLine" class="text-primary" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />

      <!-- Comments: Linie (info) -->
      <polyline :points="commentsLine" class="text-info" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />

      <!-- Y-Skala: Max oben, 0 unten -->
      <text :x="PAD" :y="PAD - 8" fill="currentColor" class="text-dimmed text-[11px]">{{ max }}</text>
      <text :x="PAD" :y="H - PAD + 16" fill="currentColor" class="text-dimmed text-[11px]">0</text>
    </svg>

    <!-- X-Achse: Tage -->
    <div class="mt-1 flex justify-between px-1 text-xs text-dimmed">
      <span v-for="(tick, i) in xTicks" :key="i">{{ tick }}</span>
    </div>

    <!-- Legende mit Summen unten links -->
    <div class="mt-3 flex flex-wrap items-center gap-4 text-sm">
      <span class="flex items-center gap-1.5">
        <span class="size-2 rounded-full bg-primary" />
        <span class="font-bold tabular-nums">{{ usersTotal }}</span>
        <span class="text-muted">{{ usersLabel }}</span>
      </span>
      <span class="flex items-center gap-1.5">
        <span class="size-2 rounded-full bg-info" />
        <span class="font-bold tabular-nums">{{ commentsTotal }}</span>
        <span class="text-muted">{{ commentsLabel }}</span>
      </span>
    </div>
  </div>
</template>
