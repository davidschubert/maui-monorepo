<script setup lang="ts">
// Passwortlose Registrierung per Email-OTP als eigene Page — SSR-sichtbar, verlinkbar,
// Back-Button funktioniert. Früher ein JS-Toggle auf /register.
definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const appConfig = useAppConfig()

// OTP deaktiviert → zurück zur Passwort-Registrierung (kein toter Pfad bei Direktaufruf)
if (appConfig.maui?.auth?.otp !== true) {
  await navigateTo('/register')
}
</script>

<template>
  <div class="w-full max-w-sm space-y-4">
    <AuthOtpLoginForm register />

    <p class="text-center">
      <UButton
        to="/register"
        variant="link"
        color="neutral"
        size="sm"
        icon="i-ph-password"
        data-otp-link
      >
        {{ t('auth.otp.switchToPasswordRegister') }}
      </UButton>
    </p>
  </div>
</template>
