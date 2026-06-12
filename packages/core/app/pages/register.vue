<script setup lang="ts">
// Out-of-the-box Register-Page aus dem Core — Apps können sie überschreiben.
// Mit maui.auth.otp gibt es auch die passwortlose Registrierung (Code per E-Mail).
definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const appConfig = useAppConfig()

const otpEnabled = computed(() => appConfig.maui?.auth?.otp === true)
const mode = ref<'password' | 'otp'>('password')
</script>

<template>
  <div class="w-full max-w-sm space-y-4">
    <AuthRegisterForm v-if="mode === 'password'" />
    <AuthOtpLoginForm v-else register />

    <p v-if="otpEnabled" class="text-center">
      <UButton
        variant="link"
        color="neutral"
        size="sm"
        :icon="mode === 'password' ? 'i-ph-envelope-simple' : 'i-ph-password'"
        data-otp-toggle
        @click="mode = mode === 'password' ? 'otp' : 'password'"
      >
        {{ mode === 'password' ? t('auth.otp.switchToOtpRegister') : t('auth.otp.switchToPasswordRegister') }}
      </UButton>
    </p>
  </div>
</template>
