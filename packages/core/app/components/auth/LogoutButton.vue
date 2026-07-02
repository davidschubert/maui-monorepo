<script setup lang="ts">
const { t } = useI18n()
const { logout, loading } = useLogout()
</script>

<template>
  <UButton color="neutral" variant="ghost" :loading="loading" @click="logout">
    {{ t('auth.logout') }}
  </UButton>
</template>
