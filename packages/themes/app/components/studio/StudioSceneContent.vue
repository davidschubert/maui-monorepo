<script setup lang="ts">
/**
 * Szene „Content": Hero, Karten-Grid und ein Formular mit Fehlerzustand —
 * zeigt das Theme im öffentlichen Seiten-Kontext (Text, Links, Fehlerfarben).
 */
const { t } = useI18n()

const email = ref('')
</script>

<template>
  <div class="min-w-0 space-y-4">
    <div class="space-y-2">
      <h3 class="text-xl font-semibold">{{ t('themes.studio.scenes.heroTitle') }}</h3>
      <p class="text-sm text-muted">{{ t('themes.studio.scenes.heroText') }}</p>
      <div class="flex flex-wrap gap-2 pt-1">
        <UButton color="primary">{{ t('themes.studio.scenes.heroCta') }}</UButton>
        <UButton color="neutral" variant="subtle">{{ t('themes.studio.scenes.heroSecondary') }}</UButton>
      </div>
    </div>

    <div class="grid min-w-0 gap-3 sm:grid-cols-2">
      <UPageCard v-for="n in 2" :key="n" variant="subtle" :ui="{ container: 'min-w-0 p-4 sm:p-4' }">
        <p class="text-sm font-medium">{{ t(`themes.studio.scenes.cardTitle${n}`) }}</p>
        <p class="text-sm text-muted">{{ t(`themes.studio.scenes.cardText${n}`) }}</p>
        <UButton color="primary" variant="link" size="sm" class="px-0" trailing-icon="i-ph-arrow-right">
          {{ t('themes.studio.scenes.cardLink') }}
        </UButton>
      </UPageCard>
    </div>

    <UPageCard variant="subtle" :ui="{ container: 'min-w-0 p-4 sm:p-4' }">
      <div class="space-y-3">
        <UFormField :label="t('themes.studio.scenes.formEmail')" :error="t('themes.studio.scenes.formError')">
          <UInput v-model="email" placeholder="name@example.com" class="w-full" />
        </UFormField>
        <UButton color="primary">{{ t('themes.studio.scenes.formSubmit') }}</UButton>
      </div>
    </UPageCard>
  </div>
</template>
