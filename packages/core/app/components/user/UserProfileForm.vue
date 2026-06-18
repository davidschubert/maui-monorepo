<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createProfileSchema, type ProfileInput } from '../../../schemas/profile'

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToast()
const loading = ref(false)

// Foto-Upload nur aktiv, wenn ein Avatars-Bucket konfiguriert ist; sonst
// fällt das Formular auf das URL-Textfeld zurück.
const avatarsBucket = useRuntimeConfig().public.appwriteAvatarsBucket
const hasBucket = computed(() => Boolean(avatarsBucket))

const schema = computed(() => createProfileSchema(t))

const state = reactive<ProfileInput>({
  name: auth.user?.name ?? '',
  bio: typeof auth.user?.prefs?.bio === 'string' ? auth.user.prefs.bio : '',
  // phone kommt aus dem nativen Appwrite-Feld, nicht aus prefs
  phone: auth.user?.phone ?? '',
  avatarUrl: typeof auth.user?.prefs?.avatarUrl === 'string' ? auth.user.prefs.avatarUrl : '',
})

async function onSubmit(event: FormSubmitEvent<ProfileInput>) {
  loading.value = true
  try {
    await $fetch('/api/auth/profile', { method: 'PUT', body: event.data })
    await auth.refresh()
    toast.add({ title: t('profile.saved'), color: 'success' })
  }
  catch (error) {
    // Telefonnummer schon vergeben (Appwrite erzwingt Eindeutigkeit) → eigene Meldung
    const code = (error as { data?: { data?: { code?: string } } })?.data?.data?.code
    toast.add({
      title: code === 'phone_taken' ? t('profile.phoneTaken') : t('profile.saveFailed'),
      color: 'error',
    })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UForm :schema="schema" :validate-on="[]" :state="state" class="space-y-4" @submit="onSubmit">
    <UFormField v-if="hasBucket" name="avatarUrl">
      <UserAvatarUpload v-model="state.avatarUrl" :name="state.name" :bucket-id="avatarsBucket" />
    </UFormField>

    <UFormField :label="t('auth.fields.name')" name="name" required>
      <UInput v-model="state.name" class="w-full" />
    </UFormField>

    <UFormField :label="t('profile.phoneLabel')" name="phone" :description="t('profile.phoneDescription')">
      <UInput v-model="state.phone" type="tel" :placeholder="t('profile.phonePlaceholder')" class="w-full" />
    </UFormField>

    <UFormField :label="t('profile.bioLabel')" name="bio" :description="t('profile.bioDescription')">
      <UTextarea v-model="state.bio" :rows="3" class="w-full" />
    </UFormField>

    <UFormField v-if="!hasBucket" :label="t('profile.avatarLabel')" name="avatarUrl">
      <UInput v-model="state.avatarUrl" :placeholder="t('profile.avatarPlaceholder')" class="w-full" />
    </UFormField>

    <UButton type="submit" :loading="loading">{{ t('ui.save') }}</UButton>
  </UForm>
</template>
