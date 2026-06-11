<script setup lang="ts">
const { t } = useI18n()
const { themes, theme, variant, setTheme, setVariant } = useTheme()

const themeItems = computed(() => themes.map(entry => ({ label: entry.name, value: entry.id })))

const selectedTheme = computed({
  get: () => theme.value.id,
  set: (id: string) => setTheme(id),
})

const variantItems = computed(() => [
  { label: t('themes.variantDefault'), value: 'none' },
  ...theme.value.variants.map(value => ({ label: value, value })),
])

const selectedVariant = computed({
  get: () => variant.value ?? 'none',
  set: (value: string) => setVariant(value === 'none' ? null : value),
})
</script>

<template>
  <div class="flex items-center gap-2" data-theme-switcher>
    <USelect v-model="selectedTheme" :items="themeItems" size="sm" :aria-label="t('themes.label')" />
    <USelect
      v-if="theme.variants.length"
      v-model="selectedVariant"
      :items="variantItems"
      size="sm"
      :aria-label="t('themes.variantLabel')"
    />
    <!-- Light/Dark/System — Nuxt UI Color Mode; Themes sind dark-aware
         (.dark[data-theme] hebt den Primary-Anker von 600 auf 400) -->
    <UColorModeSelect size="sm" :aria-label="t('themes.modeLabel')" />
  </div>
</template>
