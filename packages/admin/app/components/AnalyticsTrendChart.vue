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
const MIN_H = 3 // kleinste sichtbare Segmenthöhe, damit auch 1er-Tage einen Nub zeigen

const count = computed(() => props.points.length)
// Gestapelt → Skala richtet sich nach dem höchsten Tagessummen-Wert
const max = computed(() => Math.max(1, ...props.points.map(p => p.users + p.comments)))

function n(v: number): string {
  return v.toFixed(1)
}

// Rechteck mit getrennt rundbaren oben/unten-Ecken (für die Pill-Kappen der Stacks)
function roundRect(x: number, y: number, w: number, h: number, rTop: number, rBottom: number): string {
  const rt = Math.max(0, Math.min(rTop, w / 2, h))
  const rb = Math.max(0, Math.min(rBottom, w / 2, h))
  return [
    `M ${n(x)},${n(y + rt)}`,
    `Q ${n(x)},${n(y)} ${n(x + rt)},${n(y)}`,
    `L ${n(x + w - rt)},${n(y)}`,
    `Q ${n(x + w)},${n(y)} ${n(x + w)},${n(y + rt)}`,
    `L ${n(x + w)},${n(y + h - rb)}`,
    `Q ${n(x + w)},${n(y + h)} ${n(x + w - rb)},${n(y + h)}`,
    `L ${n(x + rb)},${n(y + h)}`,
    `Q ${n(x)},${n(y + h)} ${n(x)},${n(y + h - rb)}`,
    'Z',
  ].join(' ')
}

function shortDate(date: string): string {
  if (!date) return ''
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale.value, { day: '2-digit', month: '2-digit' })
}

const bars = computed(() => {
  const c = count.value
  if (!c) return []
  const innerW = W - 2 * PAD
  const slot = innerW / c
  const barW = Math.max(2, Math.min(10, slot * 0.5))
  const chartH = H - 2 * PAD
  const baseline = H - PAD
  const m = max.value
  const r = barW / 2

  return props.points.map((p, i) => {
    const x = PAD + slot * (i + 0.5) - barW / 2
    const hUsers = p.users > 0 ? Math.max(MIN_H, (p.users / m) * chartH) : 0
    const hComments = p.comments > 0 ? Math.max(MIN_H, (p.comments / m) * chartH) : 0
    const yUsers = baseline - hUsers
    const yComments = yUsers - hComments
    const both = hUsers > 0 && hComments > 0
    return {
      usersPath: hUsers ? roundRect(x, yUsers, barW, hUsers, both ? 0 : r, r) : '',
      commentsPath: hComments ? roundRect(x, yComments, barW, hComments, r, both ? 0 : r) : '',
      title: `${shortDate(p.date)} · ${props.usersLabel} ${p.users} · ${props.commentsLabel} ${p.comments}`,
    }
  })
})

// Waagerechte Gridlines (0 / 25 / 50 / 75 / 100 %)
const gridLines = computed(() => {
  const chartH = H - 2 * PAD
  return [0, 0.25, 0.5, 0.75, 1].map(f => PAD + f * chartH)
})

// ~5 gleichmäßig verteilte X-Achsen-Beschriftungen, letzte = "Heute"
const xTicks = computed(() => {
  const c = count.value
  if (c === 0) return []
  const idxs = [...new Set([0, Math.floor(c * 0.25), Math.floor(c * 0.5), Math.floor(c * 0.75), c - 1])]
  return idxs.map(i => (i === c - 1 ? props.todayLabel : shortDate(props.points[i]?.date ?? '')))
})
</script>

<template>
  <div class="w-full">
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      class="h-auto w-full"
      role="img"
      :aria-label="`${usersLabel}: ${usersTotal} · ${commentsLabel}: ${commentsTotal}`"
    >
      <!-- Gridlines -->
      <line
        v-for="(y, i) in gridLines" :key="i"
        :x1="PAD" :y1="y" :x2="W - PAD" :y2="y"
        class="text-default" stroke="currentColor" stroke-width="1"
        :opacity="i === gridLines.length - 1 ? 0.4 : 0.12"
      />

      <!-- Gestapelte Balken: Registrierungen (primary, unten) + Kommentare (info, oben) -->
      <g v-for="(bar, i) in bars" :key="i">
        <title>{{ bar.title }}</title>
        <path v-if="bar.usersPath" :d="bar.usersPath" class="text-primary" fill="currentColor" />
        <path v-if="bar.commentsPath" :d="bar.commentsPath" class="text-info" fill="currentColor" />
      </g>

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
