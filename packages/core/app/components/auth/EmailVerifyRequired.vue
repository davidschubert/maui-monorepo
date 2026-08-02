<script setup lang="ts">
/**
 * „Erst bestätigen, dann weiter" — die SPERRE, nicht die Erinnerung.
 *
 * Der Unterschied zu `AuthEmailVerifyBanner`: der Banner bittet, dieser Kasten
 * ERKLÄRT EINE ABLEHNUNG. Er erscheint dort, wo der Server gerade `403` mit
 * dem Grund `email_unverified` geantwortet hat — seit dem Sicherheits-Audit
 * 2026-08-02 gilt das überall, wo eine Einladung an eine ADRESSE gebunden ist
 * (Einladung in eine Community, gebundener Einladungs-Code). Der Grund: im Pool
 * darf sich jeder mit jeder Adresse registrieren, ohne sie zu bestätigen — die
 * Bindung an eine Adresse ist also nur so viel wert wie ihr Nachweis.
 *
 * WARUM MIT KNOPF UND NICHT NUR MIT SATZ: eine Ablehnung ohne Weg ist eine
 * Sackgasse. Wer hier steht, hat alles richtig gemacht und ist eine Mail
 * entfernt — der Knopf schickt sie (`POST /api/auth/verification`, dieselbe
 * Route wie der Banner). Bewusst NICHT an `pukalani.auth.verification`
 * gekoppelt: die Sperre gilt unabhängig davon, ob die App sonst zur
 * Bestätigung mahnt, und ein Kasten ohne Ausweg wäre das Schlechteste von
 * beidem.
 */
const props = defineProps<{
  /** Was gerade nicht ging — in den Worten der Seite. */
  title: string
}>()

const { t } = useI18n()
const toast = useToast()
const { user } = useCurrentUser()

const sending = ref(false)
const sent = ref(false)

const description = computed(() =>
  t('auth.verification.requiredMessage', { email: user.value?.email ?? '' }))

async function resend() {
  sending.value = true
  try {
    await $fetch('/api/auth/verification', { method: 'POST' })
    sent.value = true
    toast.add({
      title: t('auth.verification.sentTitle'),
      description: t('auth.verification.sentDescription'),
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: t('auth.verification.sendFailed'),
      description: t('auth.verification.sendFailedDescription'),
      color: 'error',
    })
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <UAlert
    color="warning"
    variant="subtle"
    icon="i-lucide-mail-warning"
    :title="props.title"
    :description="description"
    data-email-verify-required
  >
    <template #actions>
      <UButton
        color="warning"
        variant="solid"
        size="sm"
        :loading="sending"
        :disabled="sent"
        data-email-verify-resend
        @click="resend"
      >
        {{ sent ? t('auth.verification.sentTitle') : t('auth.verification.resend') }}
      </UButton>
    </template>
  </UAlert>
</template>
