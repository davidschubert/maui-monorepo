<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t } = useI18n()

useHead({ title: () => t('activity.title') })
</script>

<template>
  <UContainer class="max-w-2xl py-8">
    <h1 class="text-2xl font-bold">{{ t('activity.title') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('activity.description') }}</p>

    <ActivityFeed class="mt-6" />
  </UContainer>
</template>
