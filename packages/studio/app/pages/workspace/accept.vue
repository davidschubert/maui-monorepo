<script setup lang="ts">
/**
 * Ziel des Einladungs-Links (M9-T2): bindet den eingeloggten User an den
 * Workspace. Nicht eingeloggt → Token in localStorage parken und zum
 * OTP-Login schicken; /workspace nimmt geparkte Tokens nach dem Login
 * automatisch an (localStorage-Brücke — kein „Link nochmal öffnen").
 */
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { isLoggedIn } = useCurrentUser()

const state = ref<'working' | 'success' | 'invalid' | 'needsLogin'>('working')
const TOKEN_KEY = 'workspace-invite-token'

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  if (!/^[a-f0-9]{64}$/.test(token)) {
    state.value = 'invalid'
    return
  }
  if (!isLoggedIn.value) {
    localStorage.setItem(TOKEN_KEY, token)
    state.value = 'needsLogin'
    return
  }
  try {
    await $fetch('/api/workspace/accept', { method: 'POST', body: { token } })
    localStorage.removeItem(TOKEN_KEY)
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
      <p class="text-muted">{{ t('studio.invite.working') }}</p>
    </template>

    <template v-else-if="state === 'success'">
      <UIcon name="i-ph-check-circle" class="mx-auto size-10 text-success" />
      <h1 class="mt-3 text-xl font-semibold">{{ t('studio.invite.successTitle') }}</h1>
      <p class="mt-2 text-sm text-muted">{{ t('studio.invite.successMessage') }}</p>
      <UButton :to="localePath('/workspace')" class="mt-6" data-invite-to-workspace>{{ t('studio.invite.toWorkspace') }}</UButton>
    </template>

    <template v-else-if="state === 'needsLogin'">
      <UIcon name="i-ph-sign-in" class="mx-auto size-10 text-muted" />
      <h1 class="mt-3 text-xl font-semibold">{{ t('studio.invite.needsLoginTitle') }}</h1>
      <p class="mt-2 text-sm text-muted">{{ t('studio.invite.needsLoginMessage') }}</p>
      <UButton :to="localePath('/login/code')" class="mt-6" data-invite-login>{{ t('auth.login.title') }}</UButton>
    </template>

    <template v-else>
      <UIcon name="i-ph-warning-circle" class="mx-auto size-10 text-error" />
      <h1 class="mt-3 text-xl font-semibold">{{ t('studio.invite.invalidTitle') }}</h1>
      <p class="mt-2 text-sm text-muted">{{ t('studio.invite.invalidMessage') }}</p>
    </template>
  </div>
</template>
