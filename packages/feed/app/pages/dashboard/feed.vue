<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'feed.manage' })

const { t } = useI18n()

useHead({ title: () => t('feed.moderation.title') })
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <h1 class="text-2xl font-bold">{{ t('feed.moderation.title') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('feed.moderation.description') }}</p>

    <ActivityFeed class="mt-6" moderate />
  </div>
</template>
