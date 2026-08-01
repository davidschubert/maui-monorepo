<script setup lang="ts">
// Settings → General: Profil bearbeiten (Core-UserProfileForm)
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
</script>

useHead({ title: () => t('dashboard.settings.general') })

<template>
  <UPageCard :title="t('account.profile.title')" :description="t('account.profile.description')" variant="subtle">
    <UserProfileForm />
  </UPageCard>
</template>
