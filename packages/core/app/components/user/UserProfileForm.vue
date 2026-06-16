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
  phone: typeof auth.user?.prefs?.phone === 'string' ? auth.user.prefs.phone : '',
  avatarUrl: typeof auth.user?.prefs?.avatarUrl === 'string' ? auth.user.prefs.avatarUrl : '',
})

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

function pickPhoto() {
  fileInput.value?.click()
}

async function onPhotoSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !avatarsBucket) return

  uploading.value = true
  try {
    const { upload, fileUrl } = useStorage(avatarsBucket)
    const uploaded = await upload(file)
    state.avatarUrl = fileUrl(uploaded.$id)
  }
  catch {
    toast.add({ title: t('profile.photoUploadFailed'), color: 'error' })
  }
  finally {
    uploading.value = false
    input.value = '' // gleiche Datei erneut wählbar machen
  }
}

function removePhoto() {
  state.avatarUrl = ''
}

async function onSubmit(event: FormSubmitEvent<ProfileInput>) {
  loading.value = true
  try {
    await $fetch('/api/auth/profile', { method: 'PUT', body: event.data })
    await auth.refresh()
    toast.add({ title: t('profile.saved'), color: 'success' })
  }
  catch {
    toast.add({ title: t('profile.saveFailed'), color: 'error' })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UForm :schema="schema" :validate-on="[]" :state="state" class="space-y-4" @submit="onSubmit">
    <UFormField v-if="hasBucket" :label="t('profile.photoLabel')" name="avatarUrl" :description="t('profile.photoHint')">
      <div class="flex items-center gap-4">
        <UAvatar :src="state.avatarUrl || undefined" :alt="state.name" size="2xl" icon="i-ph-user" />
        <div class="flex flex-wrap gap-2">
          <UButton color="neutral" variant="subtle" icon="i-ph-upload-simple" :loading="uploading" @click="pickPhoto">
            {{ state.avatarUrl ? t('profile.photoChange') : t('profile.photoUpload') }}
          </UButton>
          <UButton v-if="state.avatarUrl" color="neutral" variant="ghost" icon="i-ph-trash" @click="removePhoto">
            {{ t('profile.photoRemove') }}
          </UButton>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          class="hidden"
          @change="onPhotoSelected"
        >
      </div>
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
