<script setup lang="ts">
/**
 * Szene „Komponenten": kompakter Nuxt-UI-Showcase (Buttons/Badges/Formular) —
 * geteilt zwischen Galerie und Theme-Editor (eine Quelle, kein Duplikat).
 */
const { t } = useI18n()

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

const showcaseColors = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const
const showcaseVariants = ['solid', 'outline', 'soft', 'subtle'] as const
const demoText = ref('')
const demoSelect = ref('a')
const demoCheck = ref(true)
const demoSwitch = ref(true)
const demoRange = ref(60)
</script>

<template>
  <div class="grid min-w-0 gap-4 lg:grid-cols-2">
    <UPageCard variant="subtle" :ui="{ container: 'min-w-0' }">
      <div class="space-y-2">
        <div v-for="v in showcaseVariants" :key="v" class="flex flex-wrap gap-1.5">
          <UButton v-for="c in showcaseColors" :key="c" :color="c" :variant="v" size="sm">{{ capitalize(c) }}</UButton>
        </div>
        <div class="flex flex-wrap gap-1.5 pt-1">
          <UBadge v-for="c in showcaseColors" :key="c" :color="c" variant="subtle">{{ capitalize(c) }}</UBadge>
        </div>
      </div>
    </UPageCard>
    <UPageCard variant="subtle" :ui="{ container: 'min-w-0' }">
      <div class="space-y-3">
        <UInput v-model="demoText" :placeholder="t('themes.customize.demo.placeholder')" icon="i-ph-magnifying-glass" class="w-full" />
        <USelect v-model="demoSelect" :items="[{ label: 'Option A', value: 'a' }, { label: 'Option B', value: 'b' }]" class="w-full" />
        <div class="flex flex-wrap items-center gap-4">
          <UCheckbox v-model="demoCheck" :label="t('themes.customize.demo.checkbox')" />
          <USwitch v-model="demoSwitch" :label="t('themes.customize.demo.switch')" />
        </div>
        <USlider v-model="demoRange" />
        <UProgress :model-value="demoRange" />
        <UAlert icon="i-ph-info" color="primary" variant="subtle" :title="t('themes.customize.demo.alertTitle')" :description="t('themes.customize.demo.alertText')" />
      </div>
    </UPageCard>
  </div>
</template>
