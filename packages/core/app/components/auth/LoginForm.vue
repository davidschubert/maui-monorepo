<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { loginSchema, type LoginInput } from '../../../schemas/auth'

const auth = useAuthStore()
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const fields: AuthFormField[] = [
  { name: 'email', type: 'email', label: 'E-Mail', placeholder: 'du@example.com', required: true },
  { name: 'password', type: 'password', label: 'Passwort', placeholder: 'Dein Passwort', required: true },
]

async function onSubmit(event: FormSubmitEvent<LoginInput>) {
  loading.value = true
  errorMessage.value = null

  try {
    await $fetch('/api/auth/login', { method: 'POST', body: event.data })
    await auth.refresh()
    await navigateTo('/')
  }
  catch {
    errorMessage.value = 'Anmeldung fehlgeschlagen — bitte E-Mail und Passwort prüfen.'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UAuthForm
    title="Anmelden"
    description="Melde dich mit deinem Account an."
    :schema="loginSchema"
    :fields="fields"
    :submit="{ label: 'Anmelden' }"
    :loading="loading"
    @submit="onSubmit"
  >
    <template #validation>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
    </template>
    <template #footer>
      Noch keinen Account?
      <ULink to="/register" class="font-medium text-primary">Registrieren</ULink>
    </template>
  </UAuthForm>
</template>
