<script setup lang="ts">
// Settings → General: Profil bearbeiten (Core-UserProfileForm)
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
</script>

useHead({ title: () => t('dashboard.settings.general') })

<template>
  <div class="space-y-4">
    <UPageCard :title="t('account.profile.title')" :description="t('account.profile.description')" variant="subtle">
      <UserProfileForm />
    </UPageCard>

    <!-- Der @name steht neben dem Profil, weil er dasselbe beantwortet: „wie
         trete ich hier auf". Eigene Karte, weil er anders als Name und Bio
         PRO COMMUNITY gilt und nur alle 30 Tage änderbar ist. -->
    <UPageCard variant="subtle">
      <UserHandleForm />
    </UPageCard>
  </div>
</template>
