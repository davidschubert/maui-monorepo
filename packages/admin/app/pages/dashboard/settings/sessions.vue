<script setup lang="ts">
// Settings → Sessions: eigene aktive Sessions des Users (Core-Komponente)
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()

useHead({ title: () => t('dashboard.settings.sessions') })
</script>

<template>
  <AuthAccountSessionsCard />
</template>
