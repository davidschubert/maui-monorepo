<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { createRegisterSchema, type RegisterInput } from '../../../schemas/auth'

const { t } = useI18n()
const auth = useAuthStore()
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const schema = computed(() => createRegisterSchema(t))

const fields = computed<AuthFormField[]>(() => [
  { name: 'name', type: 'text', label: t('auth.fields.name'), placeholder: t('auth.fields.namePlaceholder'), required: true },
  { name: 'email', type: 'email', label: t('auth.fields.email'), placeholder: t('auth.fields.emailPlaceholder'), required: true },
  { name: 'password', type: 'password', label: t('auth.fields.password'), placeholder: t('auth.fields.passwordHint'), required: true },
])

async function onSubmit(event: FormSubmitEvent<RegisterInput>) {
  loading.value = true
  errorMessage.value = null

  try {
    await $fetch('/api/auth/signup', { method: 'POST', body: event.data })
    await auth.refresh()
    await navigateTo('/')
  }
  catch {
    errorMessage.value = t('auth.register.failed')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UAuthForm
    :title="t('auth.register.title')"
    :description="t('auth.register.description')"
    :schema="schema"
    :fields="fields"
    :submit="{ label: t('auth.register.submit') }"
    :loading="loading"
    @submit="onSubmit"
  >
    <template #validation>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
    </template>
    <template #footer>
      {{ t('auth.register.hasAccount') }}
      <ULink to="/login" class="font-medium text-primary">{{ t('auth.register.loginLink') }}</ULink>
    </template>
  </UAuthForm>
</template>
