<script setup lang="ts">
/**
 * Szene „Dashboard": Stat-Karten, Toolbar und eine kleine Liste — nutzt
 * Primary + Neutral-Flächen intensiv und zeigt so die Theme-Wirkung im
 * Admin-Kontext (später auch den Tinted-Neutral-Effekt).
 */
const { t } = useI18n()

const search = ref('')

const stats = computed(() => [
  { label: t('themes.customize.scenes.statVisitors'), value: '2418', highlight: false },
  { label: t('themes.customize.scenes.statComments'), value: '312', highlight: false },
  { label: t('themes.customize.scenes.statOnline'), value: '37', highlight: true },
])

const rows = computed(() => [
  { title: t('themes.customize.scenes.rowReport'), status: t('themes.customize.scenes.statusOpen'), color: 'primary' as const },
  { title: t('themes.customize.scenes.rowFlagged'), status: t('themes.customize.scenes.statusReviewed'), color: 'warning' as const },
  { title: t('themes.customize.scenes.rowTheme'), status: t('themes.customize.scenes.statusDone'), color: 'success' as const },
])
</script>

<template>
  <div class="min-w-0 space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <UInput v-model="search" :placeholder="t('themes.customize.demo.placeholder')" icon="i-ph-magnifying-glass" class="min-w-0 flex-1" />
      <UButton icon="i-ph-plus" color="primary">{{ t('themes.customize.scenes.newEntry') }}</UButton>
    </div>

    <div class="grid min-w-0 gap-3 sm:grid-cols-3">
      <UPageCard v-for="stat in stats" :key="stat.label" :variant="stat.highlight ? 'soft' : 'subtle'" :ui="{ container: 'min-w-0 p-4 sm:p-4' }">
        <p class="text-xs" :class="stat.highlight ? 'text-primary' : 'text-muted'">{{ stat.label }}</p>
        <p class="text-2xl font-semibold" :class="stat.highlight ? 'text-primary' : ''">{{ stat.value }}</p>
      </UPageCard>
    </div>

    <UPageCard variant="subtle" :ui="{ container: 'min-w-0 p-4 sm:p-4' }">
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="text-sm font-medium">{{ t('themes.customize.scenes.listTitle') }}</span>
        <UBadge color="primary" variant="solid" size="sm">{{ t('themes.customize.scenes.badgeNew') }}</UBadge>
      </div>
      <ul class="divide-y divide-default">
        <li v-for="row in rows" :key="row.title" class="flex items-center justify-between gap-2 py-2 text-sm">
          <span class="truncate">{{ row.title }}</span>
          <UBadge :color="row.color" variant="subtle" size="sm">{{ row.status }}</UBadge>
        </li>
      </ul>
    </UPageCard>
  </div>
</template>
