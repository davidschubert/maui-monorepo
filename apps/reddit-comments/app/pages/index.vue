<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <main>
    <h1 class="text-2xl font-bold">Reddit Comments</h1>
    <p class="text-muted">{{ t('app.tagline') }}</p>
    <CoreSmoke />
  </main>
</template>
