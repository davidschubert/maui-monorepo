<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createLoginSchema, type LoginInput } from '../../../schemas/auth'

const { t } = useI18n()
const localePath = useLocalePath()
const appConfig = useAppConfig()
const auth = useAuthStore()
const toast = useToast()

// Zweistufiger Login: erst E-Mail (Weiter), dann Passwort (Anmelden)
const step = ref<'email' | 'password'>('email')
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const showPassword = ref(false)

// Code-Login-Link nur, wenn Email-OTP aktiviert ist (config-gated)
const otpEnabled = computed(() => appConfig.maui?.auth?.otp === true)

// Social-Login config-gated (maui.auth.providers) — Default leer, keine Deko-Buttons
const PROVIDER_META: Record<string, { label: string, icon: string }> = {
  github: { label: 'GitHub', icon: 'i-ph-github-logo' },
  google: { label: 'Google', icon: 'i-ph-google-logo' },
}
const providers = computed(() =>
  (appConfig.maui?.auth?.providers ?? []).flatMap((id) => {
    const meta = PROVIDER_META[id]
    return meta ? [{ id, ...meta }] : []
  }),
)

// Eingegebene E-Mail überlebt den Wechsel Login ↔ Register ↔ Code
const sharedEmail = useState('maui-auth-email', () => '')
const state = reactive<LoginInput>({ email: sharedEmail.value, password: '' })
watch(() => state.email, (value) => { sharedEmail.value = value })

// Schritt 1 validiert nur die E-Mail, Schritt 2 E-Mail + Passwort
const emailSchema = computed(() => createLoginSchema(t).pick({ email: true }))
const schema = computed(() => createLoginSchema(t))

function toPassword(event: FormSubmitEvent<{ email: string }>) {
  sharedEmail.value = event.data.email
  errorMessage.value = null
  step.value = 'password'
}

function back() {
  errorMessage.value = null
  step.value = 'email'
}

async function onSubmit(event: FormSubmitEvent<LoginInput>) {
  loading.value = true
  errorMessage.value = null
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: event.data })
    await auth.refresh()
    // Toast (unten rechts, auto-dismiss) — überlebt die Navigation
    toast.add({ title: t('auth.login.success'), color: 'success', icon: 'i-ph-check-circle' })
    await navigateTo(localePath('/'))
  }
  catch (error) {
    errorMessage.value = isNetworkError(error) ? t('auth.networkError') : t('auth.login.failed')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-sm space-y-4" data-login-form>
    <div class="text-center">
      <UIcon name="i-ph-user-circle" class="mx-auto size-8 text-primary" />
      <h1 class="mt-2 text-xl font-semibold">{{ t('auth.login.title') }}</h1>
      <p class="text-sm text-muted">{{ t('auth.login.description') }}</p>
    </div>

    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />

    <!-- Schritt 1: nur E-Mail -->
    <template v-if="step === 'email'">
      <div v-if="providers.length" class="space-y-2">
        <UButton
          v-for="provider in providers"
          :key="provider.id"
          :label="provider.label"
          :icon="provider.icon"
          color="neutral"
          variant="subtle"
          size="lg"
          block
          :to="`/api/auth/oauth?provider=${provider.id}`"
          external
          :data-provider="provider.id"
        />
        <USeparator :label="t('auth.or')" />
      </div>

      <UForm :schema="emailSchema" :validate-on="[]" :state="state" class="space-y-4" @submit="toPassword">
        <UFormField :label="t('auth.fields.email')" name="email" required>
          <UInput v-model="state.email" type="email" size="lg" autofocus :placeholder="t('auth.fields.emailPlaceholder')" class="w-full" />
        </UFormField>
        <UButton type="submit" block size="lg">{{ t('auth.login.continue') }}</UButton>
      </UForm>

      <p class="text-center text-sm text-muted">
        {{ t('auth.login.noAccount') }}
        <ULink :to="localePath('/register')" class="font-medium text-primary">{{ t('auth.login.registerLink') }}</ULink>
      </p>
    </template>

    <!-- Schritt 2: Passwort (E-Mail read-only) + optional Code-Login -->
    <template v-else>
      <UButton
        v-if="otpEnabled"
        :to="localePath('/login/code')"
        icon="i-ph-envelope-simple"
        color="neutral"
        variant="subtle"
        size="lg"
        block
        data-otp-link
      >
        {{ t('auth.otp.switchToOtp') }}
      </UButton>

      <UForm :schema="schema" :validate-on="[]" :state="state" class="space-y-4" @submit="onSubmit">
        <!-- E-Mail nicht editierbar — Änderung nur über «Zurück» -->
        <UFormField :label="t('auth.fields.email')" name="email">
          <UInput v-model="state.email" type="email" size="lg" readonly class="w-full" />
        </UFormField>

        <UFormField :label="t('auth.fields.password')" name="password" required>
          <template #hint>
            <ULink :to="localePath('/forgot-password')" class="text-sm text-muted hover:text-primary">
              {{ t('auth.login.forgot') }}
            </ULink>
          </template>
          <UInput
            v-model="state.password"
            :type="showPassword ? 'text' : 'password'"
            size="lg"
            autofocus
            :placeholder="t('auth.fields.passwordPlaceholder')"
            class="w-full"
          >
            <template #trailing>
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                :icon="showPassword ? 'i-ph-eye-slash' : 'i-ph-eye'"
                :aria-label="t('auth.fields.togglePassword')"
                tabindex="-1"
                @click="showPassword = !showPassword"
              />
            </template>
          </UInput>
        </UFormField>

        <!-- Zurück (sekundär) und Anmelden (primär) je zur Hälfte nebeneinander -->
        <div class="grid grid-cols-2 gap-3">
          <UButton color="neutral" variant="subtle" size="lg" block @click="back">
            {{ t('auth.login.back') }}
          </UButton>
          <UButton type="submit" size="lg" block :loading="loading">
            {{ t('auth.login.submit') }}
          </UButton>
        </div>
      </UForm>
    </template>
  </div>
</template>
