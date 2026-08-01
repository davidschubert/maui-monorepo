<script setup lang="ts">
// Settings → Security: Passwort ändern + Account löschen (beides Core-Komponenten)
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()

useHead({ title: () => t('dashboard.settings.security') })
</script>

<template>
  <AuthPasswordChangeForm />
  <AuthAccountDataExport />
  <AuthAccountDeleteCard />
</template>
