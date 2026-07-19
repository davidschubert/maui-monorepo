<script setup lang="ts">
const { t } = useI18n()
const appConfig = useAppConfig()
const { user, isLoggedIn } = useCurrentUser()
const toast = useToast()

// BEWUSST kein Close/X und keine UBanner-id: solange die Adresse
// unverifiziert ist, soll der Banner bei jedem Besuch wiederkommen (ein
// localStorage-Dismiss würde die Verifizierung dauerhaft unsichtbar machen).
// Nur nach erfolgreichem Resend verschwindet er für die laufende Sitzung.
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
    icon="i-lucide-mail-warning"
    color="neutral"
    :title="t('auth.verification.bannerMessage')"
    :actions="actions"
    data-testid="email-verify-banner"
  />
</template>
