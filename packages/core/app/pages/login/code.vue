<script setup lang="ts">
// Passwortloser Code-Login (Email-OTP) als eigene Page — SSR-sichtbar, verlinkbar,
// Back-Button funktioniert. Früher ein JS-Toggle auf /login.
definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const appConfig = useAppConfig()

// OTP deaktiviert → zurück zum Passwort-Login (kein toter Pfad bei Direktaufruf)
if (appConfig.maui?.auth?.otp !== true) {
  await navigateTo(localePath('/login'))
}
</script>

<template>
  <div class="w-full max-w-sm space-y-4">
    <AuthOtpLoginForm />

    <p class="text-center">
      <UButton
        :to="localePath('/login')"
        variant="link"
        color="neutral"
        size="sm"
        icon="i-ph-password"
        data-otp-link
      >
        {{ t('auth.otp.switchToPassword') }}
      </UButton>
    </p>
  </div>
</template>
