<script setup lang="ts">
// Out-of-the-box Login-Page aus dem Core — Apps können sie überschreiben.
// Passwort-Login; mit maui.auth.otp zusätzlich ein Link zum Code-Login (eigene Page /login/code).
definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const appConfig = useAppConfig()

const otpEnabled = computed(() => appConfig.maui?.auth?.otp === true)
</script>

<template>
  <div class="w-full max-w-sm space-y-4">
    <AuthLoginForm />

    <p v-if="otpEnabled" class="text-center">
      <UButton
        :to="localePath('/login/code')"
        variant="link"
        color="neutral"
        size="sm"
        icon="i-ph-envelope-simple"
        data-otp-link
      >
        {{ t('auth.otp.switchToOtp') }}
      </UButton>
    </p>
  </div>
</template>
