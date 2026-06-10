<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { registerSchema, type RegisterInput } from '../../../schemas/auth'

const auth = useAuthStore()
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const fields: AuthFormField[] = [
  { name: 'name', type: 'text', label: 'Name', placeholder: 'Dein Name', required: true },
  { name: 'email', type: 'email', label: 'E-Mail', placeholder: 'du@example.com', required: true },
  { name: 'password', type: 'password', label: 'Passwort', placeholder: 'Mindestens 8 Zeichen', required: true },
]

async function onSubmit(event: FormSubmitEvent<RegisterInput>) {
  loading.value = true
  errorMessage.value = null

  try {
    await $fetch('/api/auth/signup', { method: 'POST', body: event.data })
    await auth.refresh()
    await navigateTo('/')
  }
  catch {
    errorMessage.value = 'Registrierung fehlgeschlagen — existiert der Account bereits?'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UAuthForm
    title="Registrieren"
    description="Erstelle deinen Account."
    :schema="registerSchema"
    :fields="fields"
    :submit="{ label: 'Account erstellen' }"
    :loading="loading"
    @submit="onSubmit"
  >
    <template #validation>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
    </template>
    <template #footer>
      Schon einen Account?
      <ULink to="/login" class="font-medium text-primary">Anmelden</ULink>
    </template>
  </UAuthForm>
</template>
