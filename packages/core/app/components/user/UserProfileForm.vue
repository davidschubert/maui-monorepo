<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { profileSchema, type ProfileInput } from '../../../schemas/profile'

const auth = useAuthStore()
const toast = useToast()
const loading = ref(false)

const state = reactive<ProfileInput>({
  name: auth.user?.name ?? '',
  bio: typeof auth.user?.prefs?.bio === 'string' ? auth.user.prefs.bio : '',
  avatarUrl: typeof auth.user?.prefs?.avatarUrl === 'string' ? auth.user.prefs.avatarUrl : '',
})

async function onSubmit(event: FormSubmitEvent<ProfileInput>) {
  loading.value = true
  try {
    await $fetch('/api/auth/profile', { method: 'PUT', body: event.data })
    await auth.refresh()
    toast.add({ title: 'Profil gespeichert', color: 'success' })
  }
  catch {
    toast.add({ title: 'Speichern fehlgeschlagen', color: 'error' })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UForm :schema="profileSchema" :state="state" class="space-y-4" @submit="onSubmit">
    <UFormField label="Name" name="name" required>
      <UInput v-model="state.name" class="w-full" />
    </UFormField>

    <UFormField label="Bio" name="bio" description="Wird in deinen Account-prefs gespeichert.">
      <UTextarea v-model="state.bio" :rows="3" class="w-full" />
    </UFormField>

    <UFormField label="Avatar-URL" name="avatarUrl">
      <UInput v-model="state.avatarUrl" placeholder="https://…" class="w-full" />
    </UFormField>

    <UButton type="submit" :loading="loading">Speichern</UButton>
  </UForm>
</template>
