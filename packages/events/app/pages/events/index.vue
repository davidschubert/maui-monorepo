<script setup lang="ts">
/**
 * Default-Seite des Layers — öffentlich (Gäste lesen, Mitglieder sagen zu).
 */
const { t } = useI18n()

useHead({ title: () => t('events.list.title') })
</script>

<template>
  <UContainer class="max-w-5xl py-8">
    <h1 class="text-2xl font-bold">{{ t('events.list.title') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('events.list.description') }}</p>

    <EventList class="mt-6" />
  </UContainer>
</template>
