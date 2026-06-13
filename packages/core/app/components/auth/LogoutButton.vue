<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const toast = useToast()
const loading = ref(false)

async function logout() {
  loading.value = true
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
    auth.setUser(null)
    toast.add({ title: t('auth.logoutSuccess'), color: 'success', icon: 'i-ph-sign-out' })
    await navigateTo(localePath('/login'))
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UButton color="neutral" variant="ghost" :loading="loading" @click="logout">
    {{ t('auth.logout') }}
  </UButton>
</template>
