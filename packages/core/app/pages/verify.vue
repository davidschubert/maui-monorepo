<script setup lang="ts">
/**
 * Ziel des Verifizierungs-Links (Mail nach Signup bzw. Banner-Resend):
 * bestätigt userId+secret aus der Query über die eigene Session. Nicht
 * eingeloggt → Login-Hinweis (der Link bleibt bis zum Ablauf gültig).
 */
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { isLoggedIn } = useCurrentUser()
const authStore = useAuthStore()

const state = ref<'working' | 'success' | 'invalid' | 'needsLogin'>('working')

onMounted(async () => {
  const userId = typeof route.query.userId === 'string' ? route.query.userId : ''
  const secret = typeof route.query.secret === 'string' ? route.query.secret : ''
  if (!userId || !secret) {
    state.value = 'invalid'
    return
  }
  if (!isLoggedIn.value) {
    state.value = 'needsLogin'
    return
  }
  try {
    await $fetch('/api/auth/verification', { method: 'PUT', body: { userId, secret } })
    await authStore.refresh() // Banner verschwindet sofort
    state.value = 'success'
  }
  catch {
    state.value = 'invalid'
  }
})
</script>

<template>
  <div class="mx-auto max-w-md py-16 text-center">
    <template v-if="state === 'working'">
      <p class="text-muted">{{ t('auth.verification.working') }}</p>
    </template>

    <template v-else-if="state === 'success'">
      <UIcon name="i-ph-check-circle" class="mx-auto size-10 text-success" />
      <h1 class="mt-3 text-xl font-semibold">{{ t('auth.verification.successTitle') }}</h1>
      <p class="mt-2 text-sm text-muted">{{ t('auth.verification.successMessage') }}</p>
      <UButton :to="localePath('/')" class="mt-6">{{ t('auth.verification.backHome') }}</UButton>
    </template>

    <template v-else-if="state === 'needsLogin'">
      <UIcon name="i-ph-sign-in" class="mx-auto size-10 text-muted" />
      <h1 class="mt-3 text-xl font-semibold">{{ t('auth.verification.needsLoginTitle') }}</h1>
      <p class="mt-2 text-sm text-muted">{{ t('auth.verification.needsLoginMessage') }}</p>
      <UButton :to="localePath('/login')" class="mt-6">{{ t('auth.login.title') }}</UButton>
    </template>

    <template v-else>
      <UIcon name="i-ph-warning-circle" class="mx-auto size-10 text-error" />
      <h1 class="mt-3 text-xl font-semibold">{{ t('auth.verification.invalidTitle') }}</h1>
      <p class="mt-2 text-sm text-muted">{{ t('auth.verification.invalidMessage') }}</p>
      <UButton :to="localePath('/')" color="neutral" variant="subtle" class="mt-6">{{ t('auth.verification.backHome') }}</UButton>
    </template>
  </div>
</template>
