<script setup lang="ts">
import { de, en } from '@nuxt/ui/locale'

const { t, locale, setLocale } = useI18n()
const { themes, theme, variant, setTheme, setVariant } = useTheme()

// Theme-Select: Chip-Punkt = Basis-Farbe des Themes (eigene Farbe via Inline-Style,
// da Chip/color nur die 7 Theme-Farben kennt — Tailwind-JIT sieht keine Runtime-Klassen).
const themeItems = computed(() =>
  themes.map(entry => ({ label: entry.name, value: entry.id, color: entry.color })),
)
const selectedTheme = computed({
  get: () => theme.value.id,
  set: (id: string) => setTheme(id),
})
const themeColor = computed(() => theme.value.color)

// Variant-Select: "Standard" = Theme-Basisfarbe, sonst die echte Variant-Farbe
const variantItems = computed(() => [
  { label: t('themes.variantDefault'), value: 'none', color: theme.value.color },
  ...theme.value.variants.map(v => ({ label: v.id, value: v.id, color: v.color })),
])
const selectedVariant = computed({
  get: () => variant.value ?? 'none',
  set: (value: string) => setVariant(value === 'none' ? null : value),
})
const variantColor = computed(
  () => variantItems.value.find(item => item.value === selectedVariant.value)?.color,
)

// setLocale erwartet die getypten Locale-Codes — ULocaleSelect liefert string
const selectedLocale = computed({
  get: () => locale.value,
  set: (value: string) => setLocale(value as 'en' | 'de'),
})
</script>

<template>
  <div class="flex items-center gap-2" data-theme-switcher>
    <USelect v-model="selectedTheme" :items="themeItems" size="sm" :aria-label="t('themes.label')">
      <template #leading>
        <span class="inline-block size-2 rounded-full" :style="{ backgroundColor: themeColor }" />
      </template>
      <template #item-leading="{ item }">
        <span class="inline-block size-2 rounded-full" :style="{ backgroundColor: item.color }" />
      </template>
    </USelect>

    <USelect
      v-if="theme.variants.length"
      v-model="selectedVariant"
      :items="variantItems"
      size="sm"
      :aria-label="t('themes.variantLabel')"
    >
      <template #leading>
        <span class="inline-block size-2 rounded-full" :style="{ backgroundColor: variantColor }" />
      </template>
      <template #item-leading="{ item }">
        <span class="inline-block size-2 rounded-full" :style="{ backgroundColor: item.color }" />
      </template>
    </USelect>

    <!-- Light/Dark/System — Nuxt UI Color Mode; Themes sind dark-aware
         (.dark[data-theme] hebt den Primary-Anker von 600 auf 400) -->
    <UColorModeSelect size="sm" :aria-label="t('themes.modeLabel')" />

    <!-- Sprachwahl — wechselt unter der prefix-Strategie auf /de bzw. /en -->
    <ULocaleSelect
      v-model="selectedLocale"
      :locales="[en, de]"
      size="sm"
      :aria-label="t('ui.language')"
    />
  </div>
</template>
