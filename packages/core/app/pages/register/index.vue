<script setup lang="ts">
// Out-of-the-box Register-Page aus dem Core — Apps können sie überschreiben.
// Passwort-Registrierung; mit maui.auth.otp zusätzlich ein Link zur Code-Registrierung
// (eigene Page /register/code).
definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const appConfig = useAppConfig()
const { data: flags } = await useRuntimeFlags()

const otpEnabled = computed(() => appConfig.maui?.auth?.otp === true)
// Registrierung zu, wenn der Flag aus ist ODER Wartungsmodus läuft (friert Writes ein)
const registrationClosed = computed(() => !flags.value.registrationEnabled || flags.value.maintenanceMode)
const closedText = computed(() => flags.value.maintenanceMode
  ? t('auth.register.maintenanceText')
  : t('auth.register.closedText'))
</script>

<template>
  <div class="w-full max-w-sm space-y-4">
    <template v-if="registrationClosed">
      <div class="space-y-3 text-center">
        <UIcon name="i-ph-lock-simple" class="mx-auto size-8 text-muted" />
        <h1 class="text-xl font-semibold">{{ t('auth.register.closedTitle') }}</h1>
        <p class="text-sm text-muted">{{ closedText }}</p>
      </div>
      <UButton :to="localePath('/login')" icon="i-ph-sign-in" color="neutral" variant="subtle" size="lg" block>
        {{ t('auth.register.toLogin') }}
      </UButton>
    </template>

    <template v-else>
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

      <USeparator />
      <p class="text-center text-sm text-muted">
        {{ t('auth.register.hasAccount') }}
        <ULink :to="localePath('/login')" class="font-medium text-primary">{{ t('auth.register.loginLink') }}</ULink>
      </p>
    </template>
  </div>
</template>
