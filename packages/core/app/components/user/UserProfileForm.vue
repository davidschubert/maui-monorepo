<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createProfileSchema, type ProfileInput } from '../../../schemas/profile'

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToast()
const loading = ref(false)

const schema = computed(() => createProfileSchema(t))

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
    <UFormField :label="t('auth.fields.name')" name="name" required>
      <UInput v-model="state.name" class="w-full" />
    </UFormField>

    <UFormField :label="t('profile.bioLabel')" name="bio" :description="t('profile.bioDescription')">
      <UTextarea v-model="state.bio" :rows="3" class="w-full" />
    </UFormField>

    <UFormField :label="t('profile.avatarLabel')" name="avatarUrl">
      <UInput v-model="state.avatarUrl" :placeholder="t('profile.avatarPlaceholder')" class="w-full" />
    </UFormField>

    <UButton type="submit" :loading="loading">{{ t('ui.save') }}</UButton>
  </UForm>
</template>
