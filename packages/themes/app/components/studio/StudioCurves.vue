<script setup lang="ts">
/**
 * Kurven-Panel: L / C / H der generierten Ramp über die 11 Stufen als drei
 * Mini-Graphen (Anker markiert). Rein aus dem Ramp-Output berechnet — macht
 * sichtbar, was Hue-Shift/Sättigung/Anker tatsächlich tun.
 */
import type { Shade } from '../../../shared/ramp'
import { hexToRgb, SHADES } from '../../../shared/ramp'
import { rgbToOklch } from '../../../shared/oklch'

const props = defineProps<{
  ramp: Record<Shade, string>
  primary: string
}>()

const points = computed(() => SHADES.map((shade) => {
  const rgb = hexToRgb(props.ramp[shade])
  return rgb ? rgbToOklch(rgb) : { l: 0, c: 0, h: 0 }
}))

// Anker = Stufe, deren Farbe exakt der Basisfarbe entspricht (der Generator
// hält den Anker exakt); Fallback: Stufe mit der ähnlichsten Helligkeit
const anchorIndex = computed(() => {
  const primary = props.primary.toLowerCase()
  const exact = SHADES.findIndex(shade => props.ramp[shade]?.toLowerCase() === primary)
  if (exact !== -1) return exact
  const rgb = hexToRgb(props.primary)
  if (!rgb) return -1
  const baseL = rgbToOklch(rgb).l
  let best = 0
  points.value.forEach((p, i) => { if (Math.abs(p.l - baseL) < Math.abs(points.value[best]!.l - baseL)) best = i })
  return best
})

/** Hue entrollen (350°→10° soll als +20° zeichnen, nicht als Sprung) */
function unwrapHues(hues: number[]): number[] {
  const out: number[] = []
  let offset = 0
  hues.forEach((h, i) => {
    if (i > 0) {
      const prev = out[i - 1]!
      let value = h + offset
      while (value - prev > 180) { offset -= 360; value -= 360 }
      while (value - prev < -180) { offset += 360; value += 360 }
      out.push(value)
    }
    else {
      out.push(h)
    }
  })
  return out
}

// Normierte Y-Werte (0..1, 1 = oben) je Graph
const curves = computed(() => {
  const l = points.value.map(p => p.l)
  const cRaw = points.value.map(p => p.c)
  const cMax = Math.max(...cRaw, 0.01)
  const hRaw = unwrapHues(points.value.map(p => p.h))
  const hMin = Math.min(...hRaw)
  const hSpan = Math.max(Math.max(...hRaw) - hMin, 1)
  return [
    { key: 'L', values: l },
    { key: 'C', values: cRaw.map(c => c / cMax) },
    { key: 'H', values: hRaw.map(h => 0.15 + 0.7 * ((h - hMin) / hSpan)) },
  ]
})

const W = 100
const H = 44
const PAD = 5

function x(i: number): number {
  return PAD + (i / (SHADES.length - 1)) * (W - 2 * PAD)
}
function y(value: number): number {
  return H - PAD - value * (H - 2 * PAD)
}
function polyline(values: number[]): string {
  return values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
}
</script>

<template>
  <div class="grid grid-cols-3 gap-2">
    <div
      v-for="curve in curves"
      :key="curve.key"
      class="min-w-0 rounded-md bg-elevated/60 p-1.5"
    >
      <svg :viewBox="`0 0 ${W} ${H}`" class="block w-full" aria-hidden="true">
        <polyline
          :points="polyline(curve.values)"
          fill="none"
          stroke="var(--ui-primary)"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle
          v-if="anchorIndex >= 0"
          :cx="x(anchorIndex)"
          :cy="y(curve.values[anchorIndex]!)"
          r="2.4"
          fill="var(--ui-primary)"
        />
      </svg>
      <p class="mt-0.5 text-center text-[10px] leading-none text-muted">{{ curve.key }}</p>
    </div>
  </div>
</template>

