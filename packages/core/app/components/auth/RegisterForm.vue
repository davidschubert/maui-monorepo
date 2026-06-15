<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createRegisterFormSchema, type RegisterFormInput } from '../../../schemas/auth'

const { t } = useI18n()
const localePath = useLocalePath()
const appConfig = useAppConfig()
const auth = useAuthStore()
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const showPassword = ref(false)
const showPasswordConfirm = ref(false)

// AGB-Checkbox nur, wenn die App eine termsUrl konfiguriert (config-gated)
const termsUrl = computed(() => appConfig.maui?.auth?.termsUrl ?? '')
const requireTerms = computed(() => !!termsUrl.value)
const schema = computed(() => createRegisterFormSchema(t, { requireTerms: requireTerms.value }))

// Eingegebene E-Mail überlebt den Wechsel Login ↔ Register ↔ Code
const sharedEmail = useState('maui-auth-email', () => '')
const state = reactive<RegisterFormInput>({
  name: '',
  email: sharedEmail.value,
  password: '',
  passwordConfirm: '',
  terms: false,
})
watch(() => state.email, (value) => { sharedEmail.value = value })

// Passwort-Stärke — dieselben 6 Kriterien, die das Schema erzwingt (live-Feedback)
const passwordChecks = computed(() => {
  const pw = state.password ?? ''
  return [
    { label: t('auth.password.min'), valid: pw.length >= 8 },
    { label: t('auth.password.upper'), valid: /[A-Z]/.test(pw) },
    { label: t('auth.password.lower'), valid: /[a-z]/.test(pw) },
    { label: t('auth.password.number'), valid: /[0-9]/.test(pw) },
    { label: t('auth.password.special'), valid: /[^A-Za-z0-9]/.test(pw) },
    { label: t('auth.password.match'), valid: pw.length > 0 && pw === state.passwordConfirm },
  ]
})
const passwordScore = computed(() => passwordChecks.value.filter(check => check.valid).length)
const passwordColor = computed(() => {
  if (passwordScore.value === 0) return 'neutral' as const
  if (passwordScore.value <= 2) return 'error' as const
  if (passwordScore.value <= 4) return 'warning' as const
  return 'success' as const
})

async function onSubmit(event: FormSubmitEvent<RegisterFormInput>) {
  loading.value = true
  errorMessage.value = null
  try {
    // passwordConfirm/terms sind reine UI-Validierung — der Server bekommt sie nicht
    await $fetch('/api/auth/signup', {
      method: 'POST',
      body: { name: event.data.name, email: event.data.email, password: event.data.password },
    })
    await auth.refresh()
    await navigateTo(localePath('/'))
  }
  catch (error) {
    // Server weg ≠ Account existiert — ehrliche Meldung je nach Ursache
    errorMessage.value = isNetworkError(error) ? t('auth.networkError') : t('auth.register.failed')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-4" data-register-form>
    <div class="text-center">
      <UIcon name="i-ph-user-circle-plus" class="mx-auto size-8 text-primary" />
      <h1 class="mt-2 text-xl font-semibold">{{ t('auth.register.title') }}</h1>
      <p class="text-sm text-muted">{{ t('auth.register.description') }}</p>
    </div>

    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />

    <UForm :schema="schema" :validate-on="[]" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField :label="t('auth.fields.name')" name="name" required>
        <UInput v-model="state.name" size="lg" :placeholder="t('auth.fields.namePlaceholder')" class="w-full" />
      </UFormField>

      <UFormField :label="t('auth.fields.email')" name="email" required>
        <UInput v-model="state.email" type="email" size="lg" :placeholder="t('auth.fields.emailPlaceholder')" class="w-full" />
      </UFormField>

      <UFormField :label="t('auth.fields.password')" name="password" required>
        <UInput
          v-model="state.password"
          :type="showPassword ? 'text' : 'password'"
          size="lg"
          :placeholder="t('auth.fields.passwordHint')"
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

      <UFormField :label="t('auth.fields.passwordConfirm')" name="passwordConfirm" required>
        <UInput
          v-model="state.passwordConfirm"
          :type="showPasswordConfirm ? 'text' : 'password'"
          size="lg"
          :placeholder="t('auth.fields.passwordConfirmPlaceholder')"
          class="w-full"
        >
          <template #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              :icon="showPasswordConfirm ? 'i-ph-eye-slash' : 'i-ph-eye'"
              :aria-label="t('auth.fields.togglePassword')"
              tabindex="-1"
              @click="showPasswordConfirm = !showPasswordConfirm"
            />
          </template>
        </UInput>
      </UFormField>

      <!-- Passwort-Stärke-Indikator (unter dem zweiten Passwortfeld) -->
      <div class="space-y-2">
        <UProgress :model-value="passwordScore" :max="6" :color="passwordColor" size="sm" />
        <ul class="space-y-1">
          <li
            v-for="(check, index) in passwordChecks"
            :key="index"
            class="flex items-center gap-1.5 text-xs"
            :class="check.valid ? 'text-success' : 'text-muted'"
          >
            <UIcon :name="check.valid ? 'i-ph-check-circle' : 'i-ph-circle-dashed'" class="size-4 shrink-0" />
            <span>{{ check.label }}</span>
          </li>
        </ul>
      </div>

      <UFormField v-if="requireTerms" name="terms">
        <UCheckbox v-model="state.terms" :label="t('auth.register.termsLabel')" />
      </UFormField>

      <UButton type="submit" block size="lg" :loading="loading">{{ t('auth.register.submit') }}</UButton>
    </UForm>

    <p v-if="termsUrl" class="text-center">
      <ULink :to="termsUrl" target="_blank" class="text-sm text-muted hover:text-primary">
        {{ t('auth.register.termsLink') }}
      </ULink>
    </p>
  </div>
</template>
