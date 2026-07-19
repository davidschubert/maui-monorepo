<script setup lang="ts">
const { t } = useI18n()
const appConfig = useAppConfig()
const { user, isLoggedIn } = useCurrentUser()
const toast = useToast()

// Session-Dismiss nach erfolgreichem Resend; das X des UBanner persistiert
// zusätzlich pro User in localStorage (banner-email-verify-<userId>) —
// nach einem harten Reload bleibt der Banner damit weggeklickt.
const dismissed = ref(false)
const sending = ref(false)

const visible = computed(() =>
  appConfig.maui?.auth?.verification === true
  && isLoggedIn.value
  && user.value?.emailVerification === false
  && !dismissed.value,
)

const actions = computed(() => [{
  label: t('auth.verification.resend'),
  loading: sending.value,
  onClick: () => { void resend() },
}])

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
  <UBanner
    v-if="visible"
    :id="`email-verify-${user?.$id}`"
    icon="i-lucide-mail-warning"
    color="neutral"
    :title="t('auth.verification.bannerMessage')"
    :actions="actions"
    close
    data-testid="email-verify-banner"
  />
</template>
