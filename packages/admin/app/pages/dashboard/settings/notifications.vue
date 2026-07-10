<script setup lang="ts">
// Settings → Benachrichtigungen: E-Mail-Präferenz (Core-UserNotificationSettings)
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
</script>

<template>
  <UPageCard :title="t('notifications.email.title')" :description="t('notifications.email.description')" variant="subtle">
    <UserNotificationSettings />
  </UPageCard>
</template>
