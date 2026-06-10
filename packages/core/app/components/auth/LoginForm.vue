<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { createLoginSchema, type LoginInput } from '../../../schemas/auth'

const { t } = useI18n()
const auth = useAuthStore()
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const schema = computed(() => createLoginSchema(t))

const fields = computed<AuthFormField[]>(() => [
  { name: 'email', type: 'email', label: t('auth.fields.email'), placeholder: t('auth.fields.emailPlaceholder'), required: true },
  { name: 'password', type: 'password', label: t('auth.fields.password'), placeholder: t('auth.fields.passwordPlaceholder'), required: true },
])

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
    :title="t('auth.login.title')"
    :description="t('auth.login.description')"
    :schema="schema"
    :fields="fields"
    :submit="{ label: t('auth.login.submit') }"
    :loading="loading"
    @submit="onSubmit"
  >
    <template #validation>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
    </template>
    <template #footer>
      {{ t('auth.login.noAccount') }}
      <ULink to="/register" class="font-medium text-primary">{{ t('auth.login.registerLink') }}</ULink>
    </template>
  </UAuthForm>
</template>
