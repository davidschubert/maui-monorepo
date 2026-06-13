<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createRecoverySchema, type RecoveryInput } from '../../schemas/auth'

definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const loading = ref(false)
const sent = ref(false)

const schema = computed(() => createRecoverySchema(t))
const sharedEmail = useState('maui-auth-email', () => '')
const state = reactive<RecoveryInput>({ email: sharedEmail.value })

async function onSubmit(event: FormSubmitEvent<RecoveryInput>) {
  loading.value = true
  try {
    await $fetch('/api/auth/recovery', { method: 'POST', body: event.data })
    sent.value = true
  }
  catch {
    // Auch bei 429 etc. keine Account-Detail-Leaks — generische Anzeige
    sent.value = true
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-sm space-y-4" data-forgot-password>
    <div class="text-center">
      <UIcon name="i-ph-key" class="mx-auto size-8 text-primary" />
      <h1 class="mt-2 text-xl font-semibold">{{ t('auth.forgot.title') }}</h1>
      <p class="text-sm text-muted">{{ t('auth.forgot.description') }}</p>
    </div>

    <UAlert v-if="sent" color="success" variant="subtle" :title="t('auth.forgot.success')" />

    <UForm v-else :schema="schema" :validate-on="[]" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField :label="t('auth.fields.email')" name="email" required>
        <UInput v-model="state.email" type="email" size="lg" :placeholder="t('auth.fields.emailPlaceholder')" class="w-full" />
      </UFormField>
      <UButton type="submit" block size="lg" :loading="loading">{{ t('auth.forgot.submit') }}</UButton>
    </UForm>

    <p class="text-center text-sm text-muted">
      <ULink to="/login" class="font-medium text-primary">{{ t('auth.forgot.back') }}</ULink>
    </p>
  </div>
</template>
