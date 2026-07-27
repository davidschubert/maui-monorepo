<script setup lang="ts">
// Out-of-the-box Register-Page aus dem Core — Apps können sie überschreiben.
// Passwort-Registrierung; mit maui.auth.otp zusätzlich ein Link zur Code-Registrierung
// (eigene Page /register/code).
definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const appConfig = useAppConfig()
const flags = useRuntimeFlags()

const otpEnabled = computed(() => appConfig.maui?.auth?.otp === true)
// Seitentitel „Registrieren · <Brand>" — gleiche Kette wie /login (B3-Rest).
useBrandTitle(() => t('auth.register.title'))
// S1 (Davids Entscheidung 4): diese Community nimmt neue Mitglieder nur auf
// Einladung auf. Eigener Zweig VOR den bestehenden — der Grund ist ein anderer
// als „Registrierung geschlossen" (Betreiber-Flag/Wartung) und der Text sagt
// den Community-Namen. Autorität bleibt der Server (403 auf /api/auth/signup).
const { closed: inviteOnly } = useTenantOpenRegistration()
const brand = useBrandName()
// Registrierung zu, wenn der Flag aus ist ODER Wartungsmodus läuft (friert Writes ein)
const registrationClosed = computed(() => !flags.value.registrationEnabled || flags.value.maintenanceMode)
const closedText = computed(() => flags.value.maintenanceMode
  ? t('auth.register.maintenanceText')
  : t('auth.register.closedText'))
</script>

<template>
  <div class="w-full max-w-sm space-y-4">
    <template v-if="inviteOnly">
      <div class="space-y-3 text-center">
        <UIcon name="i-ph-envelope-simple" class="mx-auto size-8 text-primary" />
        <h1 class="text-xl font-semibold">{{ t('auth.register.inviteOnlyTitle') }}</h1>
        <p class="text-sm text-muted">{{ t('auth.register.inviteOnlyText', { brand }) }}</p>
      </div>
      <UButton :to="localePath('/login')" color="primary" size="lg" block>
        {{ t('auth.register.toLogin') }}
      </UButton>
    </template>

    <template v-else-if="registrationClosed">
      <div class="space-y-3 text-center">
        <UIcon name="i-ph-lock-simple" class="mx-auto size-8 text-primary" />
        <h1 class="text-xl font-semibold">{{ t('auth.register.closedTitle') }}</h1>
        <p class="text-sm text-muted">{{ closedText }}</p>
      </div>
      <UButton :to="localePath('/login')" color="primary" size="lg" block>
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
