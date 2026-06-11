<script setup lang="ts">
// Platzhalter — die Moderations-Funktionalität kommt in Phase 14
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold">{{ t('admin.nav.comments') }}</h1>
    <UAlert color="info" variant="subtle" :title="t('admin.comingSoon')" />
  </div>
</template>
