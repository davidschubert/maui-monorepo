<script setup lang="ts">
// Out-of-the-box Login-Page aus dem Core — Apps können sie überschreiben.
// Mit maui.auth.otp bietet sie zusätzlich den passwortlosen Code-Login an.
definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const appConfig = useAppConfig()

const otpEnabled = computed(() => appConfig.maui?.auth?.otp === true)
const mode = ref<'password' | 'otp'>('password')
</script>

<template>
  <div class="w-full max-w-sm space-y-4">
    <AuthLoginForm v-if="mode === 'password'" />
    <AuthOtpLoginForm v-else />

    <p v-if="otpEnabled" class="text-center">
      <UButton
        variant="link"
        color="neutral"
        size="sm"
        :icon="mode === 'password' ? 'i-ph-envelope-simple' : 'i-ph-password'"
        data-otp-toggle
        @click="mode = mode === 'password' ? 'otp' : 'password'"
      >
        {{ mode === 'password' ? t('auth.otp.switchToOtp') : t('auth.otp.switchToPassword') }}
      </UButton>
    </p>
  </div>
</template>
