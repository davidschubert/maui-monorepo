<script setup lang="ts">
// Out-of-the-box Register-Page aus dem Core — Apps können sie überschreiben.
// Passwort-Registrierung; mit maui.auth.otp zusätzlich ein Link zur Code-Registrierung
// (eigene Page /register/code).
definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const appConfig = useAppConfig()

const otpEnabled = computed(() => appConfig.maui?.auth?.otp === true)
</script>

<template>
  <div class="w-full max-w-sm space-y-4">
    <AuthRegisterForm />

    <template v-if="otpEnabled">
      <USeparator :label="t('auth.or')" />
      <UButton
        :to="localePath('/register/code')"
        icon="i-ph-envelope-simple"
        color="neutral"
        variant="subtle"
        size="lg"
        block
        data-otp-link
      >
        {{ t('auth.otp.switchToOtpRegister') }}
      </UButton>
    </template>
  </div>
</template>
