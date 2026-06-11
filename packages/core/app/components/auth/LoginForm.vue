<script setup lang="ts">
import type { AuthFormField, ButtonProps, FormSubmitEvent } from '@nuxt/ui'
import { createLoginSchema, type LoginInput } from '../../../schemas/auth'

const { t } = useI18n()
const appConfig = useAppConfig()
const auth = useAuthStore()
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const schema = computed(() => createLoginSchema(t))

// size lg → 44px-Touch-Targets (Login-Anatomy-Guide)
const fields = computed<AuthFormField[]>(() => [
  { name: 'email', type: 'email', label: t('auth.fields.email'), placeholder: t('auth.fields.emailPlaceholder'), required: true, size: 'lg' },
  { name: 'password', type: 'password', label: t('auth.fields.password'), placeholder: t('auth.fields.passwordPlaceholder'), required: true, size: 'lg' },
])

// Social-Login config-gated (maui.auth.providers) — Default leer, keine Deko-Buttons
const PROVIDER_META: Record<string, { label: string, icon: string }> = {
  github: { label: 'GitHub', icon: 'i-ph-github-logo' },
  google: { label: 'Google', icon: 'i-ph-google-logo' },
}

const providers = computed<ButtonProps[] | undefined>(() => {
  const configured = (appConfig.maui?.auth?.providers ?? [])
    .flatMap((id) => {
      const meta = PROVIDER_META[id]
      return meta
        ? [{
            'label': meta.label,
            'icon': meta.icon,
            'color': 'neutral' as const,
            'variant': 'subtle' as const,
            'size': 'lg' as const,
            'to': `/api/auth/oauth?provider=${id}`,
            'external': true,
            'data-provider': id,
          }]
        : []
    })
  return configured.length ? configured : undefined
})

// Eingegebene E-Mail überlebt den Wechsel Login↔Register
const sharedEmail = useState('maui-auth-email', () => '')
const authForm = useTemplateRef<{ state: Partial<LoginInput> } | null>('authForm')

onMounted(() => {
  if (sharedEmail.value && authForm.value?.state) {
    authForm.value.state.email = sharedEmail.value
  }
  watch(() => authForm.value?.state?.email, (value) => {
    if (typeof value === 'string') sharedEmail.value = value
  })
})

async function onSubmit(event: FormSubmitEvent<LoginInput>) {
  loading.value = true
  errorMessage.value = null

  try {
    await $fetch('/api/auth/login', { method: 'POST', body: event.data })
    await auth.refresh()
    await navigateTo('/')
  }
  catch {
    errorMessage.value = t('auth.login.failed')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UAuthForm
    ref="authForm"
    icon="i-ph-user-circle"
    :title="t('auth.login.title')"
    :description="t('auth.login.description')"
    :schema="schema"
    :fields="fields"
    :providers="providers"
    :submit="{ label: t('auth.login.submit'), size: 'lg' }"
    :loading="loading"
    @submit="onSubmit"
  >
    <template #validation>
      <div class="flex justify-end">
        <ULink to="/forgot-password" class="text-sm text-muted hover:text-primary">
          {{ t('auth.login.forgot') }}
        </ULink>
      </div>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" class="mt-2" />
    </template>
    <template #footer>
      {{ t('auth.login.noAccount') }}
      <ULink to="/register" class="font-medium text-primary">{{ t('auth.login.registerLink') }}</ULink>
    </template>
  </UAuthForm>
</template>
