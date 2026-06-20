<script setup lang="ts">
// Passwortlose Registrierung per Email-OTP als eigene Page — SSR-sichtbar, verlinkbar,
// Back-Button funktioniert. Früher ein JS-Toggle auf /register.
definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const appConfig = useAppConfig()
const { data: flags } = await useRuntimeFlags()

// OTP deaktiviert ODER Registrierung geschlossen → zurück zu /register
// (dort liegt der "Registrierung geschlossen"-Hinweis zentral)
if (appConfig.maui?.auth?.otp !== true || !flags.value.registrationEnabled || flags.value.maintenanceMode) {
  await navigateTo(localePath('/register'))
}
</script>

<template>
  <div class="w-full max-w-sm space-y-4">
    <AuthOtpLoginForm register />

    <USeparator :label="t('auth.or')" />
    <UButton
      :to="localePath('/register')"
      icon="i-ph-password"
      color="neutral"
      variant="subtle"
      size="lg"
      block
      data-otp-link
    >
      {{ t('auth.otp.switchToPasswordRegister') }}
    </UButton>

    <USeparator />
    <p class="text-center text-sm text-muted">
      {{ t('auth.register.hasAccount') }}
      <ULink :to="localePath('/login/code')" class="font-medium text-primary">{{ t('auth.register.loginLink') }}</ULink>
    </p>
  </div>
</template>
