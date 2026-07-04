<script setup lang="ts">
/**
 * Szene „Branding": die Identität des aktiven Themes auf einen Blick —
 * Primary-/Neutral-Ramp (live aus den CSS-Variablen gelesen, inkl. Draft),
 * semantische Farben, Radius und Typografie (H1–H5, Fließtext) in der
 * aktiven Schrift. Ersetzt das Live-Panel der früheren Styleguide-Seite.
 */
import { SHADES } from '../../../shared/ramp'

const { t } = useI18n()
const { theme, variant, neutral } = useTheme()

const primaryRamp = ref<{ shade: number, value: string }[]>([])
const neutralRamp = ref<{ shade: number, value: string }[]>([])
const radius = ref('')
const fontName = ref('')

let readTimer: number | undefined
function scheduleRead() {
  if (import.meta.server) return
  window.clearTimeout(readTimer)
  // kurz warten, bis die CSS-Variablen nach einem Wechsel greifen
  readTimer = window.setTimeout(readVars, 60)
}

function readVars() {
  const s = getComputedStyle(document.documentElement)
  primaryRamp.value = SHADES.map(shade => ({ shade, value: s.getPropertyValue(`--ui-color-primary-${shade}`).trim() }))
  neutralRamp.value = SHADES.map(shade => ({ shade, value: s.getPropertyValue(`--ui-color-neutral-${shade}`).trim() }))
  radius.value = s.getPropertyValue('--ui-radius').trim() || '—'
  fontName.value = getComputedStyle(document.body).fontFamily.split(',')[0]?.replace(/["']/g, '').trim() ?? ''
}

// Theme-Wechsel über den State — und Draft-Änderungen im Editor (injiziertes
// <style> + data-Attribute) über einen MutationObserver
watch([theme, variant, neutral], scheduleRead)
let observer: MutationObserver | null = null
onMounted(() => {
  readVars()
  observer = new MutationObserver(scheduleRead)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-variant', 'data-neutral', 'data-font', 'class'] })
  observer.observe(document.head, { childList: true, subtree: true, characterData: true })
})
onScopeDispose(() => {
  observer?.disconnect()
  if (import.meta.client) window.clearTimeout(readTimer)
})

const semanticColors = ['primary', 'secondary', 'success', 'info', 'warning', 'error'] as const
const headings = [
  { tag: 'h1', class: 'text-4xl font-bold' },
  { tag: 'h2', class: 'text-3xl font-bold' },
  { tag: 'h3', class: 'text-2xl font-semibold' },
  { tag: 'h4', class: 'text-xl font-semibold' },
  { tag: 'h5', class: 'text-lg font-medium' },
] as const
</script>

<template>
  <div class="min-w-0 space-y-6">
    <!-- Farben -->
    <section class="space-y-4">
      <h3 class="text-sm font-semibold">{{ t('themes.studio.scenes.colors') }}</h3>
      <div>
        <p class="mb-1.5 text-xs text-muted">Primary · {{ t('themes.studio.scenes.radiusLabel') }} {{ radius }}</p>
        <div class="flex overflow-hidden rounded-lg ring-1 ring-default">
          <div
            v-for="c in primaryRamp" :key="c.shade"
            class="h-10 flex-1" :style="{ backgroundColor: c.value }"
            :title="`primary-${c.shade}: ${c.value}`"
          />
        </div>
        <div class="mt-1 flex text-[10px] text-dimmed">
          <span v-for="c in primaryRamp" :key="c.shade" class="flex-1 text-center">{{ c.shade }}</span>
        </div>
      </div>
      <div>
        <p class="mb-1.5 text-xs text-muted">Neutral</p>
        <div class="flex overflow-hidden rounded-lg ring-1 ring-default">
          <div
            v-for="c in neutralRamp" :key="c.shade"
            class="h-10 flex-1" :style="{ backgroundColor: c.value }"
            :title="`neutral-${c.shade}: ${c.value}`"
          />
        </div>
        <div class="mt-1 flex text-[10px] text-dimmed">
          <span v-for="c in neutralRamp" :key="c.shade" class="flex-1 text-center">{{ c.shade }}</span>
        </div>
      </div>
      <div>
        <p class="mb-1.5 text-xs text-muted">{{ t('themes.studio.scenes.semantic') }}</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="color in semanticColors" :key="color"
            class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ring-1 ring-default"
          >
            <span class="size-3.5 rounded-full" :style="{ backgroundColor: `var(--ui-${color})` }" />
            {{ color }}
          </span>
        </div>
      </div>
    </section>

    <USeparator />

    <!-- Typografie -->
    <section class="space-y-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold">{{ t('themes.studio.scenes.typography') }}</h3>
        <UBadge color="neutral" variant="subtle" size="sm">{{ fontName }}</UBadge>
      </div>
      <component
        :is="h.tag"
        v-for="h in headings"
        :key="h.tag"
        :class="h.class"
      >
        {{ h.tag.toUpperCase() }} · {{ t('themes.studio.scenes.headingSample') }}
      </component>
      <p class="max-w-prose text-base">{{ t('themes.studio.scenes.bodySample') }}</p>
      <p class="max-w-prose text-sm text-muted">{{ t('themes.studio.scenes.mutedSample') }}</p>
    </section>
  </div>
</template>
