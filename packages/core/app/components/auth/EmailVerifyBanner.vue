<script setup lang="ts">
const { t } = useI18n()
const appConfig = useAppConfig()
const { user, isLoggedIn } = useCurrentUser()
const toast = useToast()

// Pro Tab einmal wegklickbar (kein Cookie — der Hinweis darf wiederkommen)
const dismissed = ref(false)
const sending = ref(false)

const visible = computed(() =>
  appConfig.maui?.auth?.verification === true
  && isLoggedIn.value
  && user.value?.emailVerification === false
  && !dismissed.value,
)

async function resend() {
  sending.value = true
  try {
    await $fetch('/api/auth/verification', { method: 'POST' })
    toast.add({ title: t('auth.verification.sentTitle'), description: t('auth.verification.sentDescription'), color: 'success' })
    dismissed.value = true
  }
  catch {
    toast.add({ title: t('auth.verification.sendFailed'), color: 'error' })
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <div
    v-if="visible"
    role="region"
    :aria-label="t('auth.verification.bannerTitle')"
    data-testid="email-verify-banner"
    class="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-lg border border-default bg-default p-4 shadow-lg"
  >
    <p class="text-sm font-medium">{{ t('auth.verification.bannerTitle') }}</p>
    <p class="mt-1 text-sm text-muted">{{ t('auth.verification.bannerMessage') }}</p>
    <div class="mt-3 flex justify-end gap-2">
      <UButton color="neutral" variant="ghost" size="sm" @click="dismissed = true">{{ t('auth.verification.later') }}</UButton>
      <UButton size="sm" :loading="sending" @click="resend">{{ t('auth.verification.resend') }}</UButton>
    </div>
  </div>
</template>
