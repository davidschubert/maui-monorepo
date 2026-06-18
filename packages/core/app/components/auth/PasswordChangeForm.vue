<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createPasswordChangeSchema, type PasswordChangeInput } from '../../../schemas/auth'

const { t } = useI18n()
const toast = useToast()

const loading = ref(false)
const showCurrent = ref(false)
const showNew = ref(false)
const showConfirm = ref(false)

const schema = computed(() => createPasswordChangeSchema(t))
const state = reactive<PasswordChangeInput>({ currentPassword: '', password: '', passwordConfirm: '' })

async function onSubmit(event: FormSubmitEvent<PasswordChangeInput>) {
  loading.value = true
  try {
    await $fetch('/api/auth/password', {
      method: 'PUT',
      body: { currentPassword: event.data.currentPassword, password: event.data.password },
    })
    toast.add({ title: t('account.password.success'), color: 'success', icon: 'i-ph-check-circle' })
    state.currentPassword = ''
    state.password = ''
    state.passwordConfirm = ''
  }
  catch (error) {
    toast.add({ title: isNetworkError(error) ? t('auth.networkError') : t('account.password.failed'), color: 'error' })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UPageCard :title="t('account.password.title')" :description="t('account.password.description')" variant="subtle">
    <UForm :schema="schema" :validate-on="[]" :state="state" class="flex w-full max-w-sm flex-col gap-4" @submit="onSubmit">
      <UFormField :label="t('account.password.current')" name="currentPassword" required>
        <UInput v-model="state.currentPassword" :type="showCurrent ? 'text' : 'password'" size="lg" class="w-full">
          <template #trailing>
            <UButton color="neutral" variant="link" size="sm" :icon="showCurrent ? 'i-ph-eye-slash' : 'i-ph-eye'" :aria-label="t('auth.fields.togglePassword')" tabindex="-1" @click="showCurrent = !showCurrent" />
          </template>
        </UInput>
      </UFormField>

      <UFormField :label="t('account.password.new')" name="password" required>
        <UInput v-model="state.password" :type="showNew ? 'text' : 'password'" size="lg" :placeholder="t('auth.fields.passwordHint')" class="w-full">
          <template #trailing>
            <UButton color="neutral" variant="link" size="sm" :icon="showNew ? 'i-ph-eye-slash' : 'i-ph-eye'" :aria-label="t('auth.fields.togglePassword')" tabindex="-1" @click="showNew = !showNew" />
          </template>
        </UInput>
      </UFormField>

      <UFormField :label="t('account.password.confirm')" name="passwordConfirm" required>
        <UInput v-model="state.passwordConfirm" :type="showConfirm ? 'text' : 'password'" size="lg" class="w-full">
          <template #trailing>
            <UButton color="neutral" variant="link" size="sm" :icon="showConfirm ? 'i-ph-eye-slash' : 'i-ph-eye'" :aria-label="t('auth.fields.togglePassword')" tabindex="-1" @click="showConfirm = !showConfirm" />
          </template>
        </UInput>
      </UFormField>

      <!-- Passwort-Stärke-Indikator wie auf der Register-Seite -->
      <AuthPasswordStrengthMeter :password="state.password" :password-confirm="state.passwordConfirm" />

      <UButton type="submit" :label="t('account.password.submit')" size="lg" class="w-fit" :loading="loading" />
    </UForm>
  </UPageCard>
</template>
