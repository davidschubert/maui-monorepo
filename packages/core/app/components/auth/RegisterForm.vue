<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { createRegisterFormSchema, type RegisterFormInput } from '../../../schemas/auth'

const { t } = useI18n()
const appConfig = useAppConfig()
const auth = useAuthStore()
const loading = ref(false)
const errorMessage = ref<string | null>(null)

// AGB-Checkbox nur, wenn die App eine termsUrl konfiguriert (config-gated)
const termsUrl = computed(() => appConfig.maui?.auth?.termsUrl ?? '')
const schema = computed(() => createRegisterFormSchema(t, { requireTerms: !!termsUrl.value }))

const fields = computed<AuthFormField[]>(() => [
  { name: 'name', type: 'text', label: t('auth.fields.name'), placeholder: t('auth.fields.namePlaceholder'), required: true, size: 'lg' },
  { name: 'email', type: 'email', label: t('auth.fields.email'), placeholder: t('auth.fields.emailPlaceholder'), required: true, size: 'lg' },
  { name: 'password', type: 'password', label: t('auth.fields.password'), placeholder: t('auth.fields.passwordHint'), required: true, size: 'lg' },
  { name: 'passwordConfirm', type: 'password', label: t('auth.fields.passwordConfirm'), placeholder: t('auth.fields.passwordConfirmPlaceholder'), required: true, size: 'lg' },
  ...(termsUrl.value
    ? [{ name: 'terms', type: 'checkbox' as const, label: t('auth.register.termsLabel') }]
    : []),
])

// Eingegebene E-Mail überlebt den Wechsel Login↔Register
const sharedEmail = useState('maui-auth-email', () => '')
const authForm = useTemplateRef<{ state: Partial<RegisterFormInput> } | null>('authForm')

onMounted(() => {
  if (sharedEmail.value && authForm.value?.state) {
    authForm.value.state.email = sharedEmail.value
  }
  watch(() => authForm.value?.state?.email, (value) => {
    if (typeof value === 'string') sharedEmail.value = value
  })
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
    await navigateTo('/')
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
  <UAuthForm
    ref="authForm"
    icon="i-ph-user-circle-plus"
    :ui="{ leadingIcon: 'text-primary' }"
    :title="t('auth.register.title')"
    :description="t('auth.register.description')"
    :schema="schema"
    :validate-on="[]"
    :fields="fields"
    :submit="{ label: t('auth.register.submit'), size: 'lg' }"
    :loading="loading"
    @submit="onSubmit"
  >
    <template #validation>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
    </template>
    <template #footer>
      <p>
        {{ t('auth.register.hasAccount') }}
        <ULink to="/login" class="font-medium text-primary">{{ t('auth.register.loginLink') }}</ULink>
      </p>
      <p v-if="termsUrl" class="mt-1">
        <ULink :to="termsUrl" target="_blank" class="text-sm text-muted hover:text-primary">
          {{ t('auth.register.termsLink') }}
        </ULink>
      </p>
    </template>
  </UAuthForm>
</template>
