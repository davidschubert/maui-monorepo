<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createRecoverySchema, type RecoveryInput } from '../../../schemas/auth'

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToast()

const step = ref<'email' | 'code'>('email')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

// E-Mail teilt sich den State mit Login/Register (Flow-Wechsel)
const sharedEmail = useState('maui-auth-email', () => '')
const emailSchema = computed(() => createRecoverySchema(t))
const emailState = reactive<RecoveryInput>({ email: sharedEmail.value })

const userId = ref('')
const phrase = ref('')
const code = ref<string[]>([])

// "Code erneut senden" mit Countdown
const resendIn = ref(0)
let countdown: ReturnType<typeof setInterval> | null = null

function startCountdown() {
  resendIn.value = 30
  if (countdown) clearInterval(countdown)
  countdown = setInterval(() => {
    resendIn.value -= 1
    if (resendIn.value <= 0 && countdown) clearInterval(countdown)
  }, 1000)
}

onScopeDispose(() => {
  if (countdown) clearInterval(countdown)
})

async function requestCode(event: FormSubmitEvent<RecoveryInput>) {
  loading.value = true
  errorMessage.value = null
  try {
    const response = await $fetch<{ ok: boolean, userId: string, phrase: string }>('/api/auth/otp', {
      method: 'POST',
      body: { email: event.data.email },
    })
    sharedEmail.value = event.data.email
    userId.value = response.userId
    phrase.value = response.phrase
    code.value = []
    step.value = 'code'
    startCountdown()
  }
  catch (error) {
    errorMessage.value = isNetworkError(error) ? t('auth.networkError') : t('auth.otp.requestFailed')
  }
  finally {
    loading.value = false
  }
}

async function resend() {
  if (resendIn.value > 0) return
  loading.value = true
  try {
    const response = await $fetch<{ ok: boolean, userId: string, phrase: string }>('/api/auth/otp', {
      method: 'POST',
      body: { email: emailState.email },
    })
    userId.value = response.userId
    phrase.value = response.phrase
    startCountdown()
  }
  catch {
    errorMessage.value = t('auth.otp.requestFailed')
  }
  finally {
    loading.value = false
  }
}

async function verify() {
  const secret = code.value.join('')
  if (secret.length !== 6) return
  loading.value = true
  errorMessage.value = null
  try {
    await $fetch('/api/auth/otp/verify', { method: 'POST', body: { userId: userId.value, code: secret } })
    await auth.refresh()
    toast.add({ title: t('auth.login.success'), color: 'success', icon: 'i-ph-check-circle' })
    await navigateTo('/')
  }
  catch {
    errorMessage.value = t('auth.otp.invalidCode')
    code.value = []
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-4" data-otp-login>
    <div class="text-center">
      <UIcon name="i-ph-envelope-simple" class="mx-auto size-8 text-primary" />
      <h1 class="mt-2 text-xl font-semibold">{{ t('auth.otp.title') }}</h1>
      <p class="text-sm text-muted">
        {{ step === 'email' ? t('auth.otp.description') : t('auth.otp.codeDescription', { email: emailState.email }) }}
      </p>
    </div>

    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />

    <UForm v-if="step === 'email'" :schema="emailSchema" :state="emailState" class="space-y-4" @submit="requestCode">
      <UFormField :label="t('auth.fields.email')" name="email" required>
        <UInput v-model="emailState.email" type="email" size="lg" :placeholder="t('auth.fields.emailPlaceholder')" class="w-full" />
      </UFormField>
      <UButton type="submit" block size="lg" :loading="loading">{{ t('auth.otp.requestCode') }}</UButton>
    </UForm>

    <template v-else>
      <!-- Phishing-Schutz: dieselbe Phrase steht in der echten Mail -->
      <UAlert color="info" variant="subtle" :title="t('auth.otp.phraseHint')" :description="`«${phrase}»`" />

      <div class="flex justify-center">
        <UPinInput v-model="code" :length="6" otp size="lg" autofocus @complete="verify" />
      </div>

      <UButton block size="lg" :loading="loading" :disabled="code.join('').length !== 6" @click="verify">
        {{ t('auth.otp.verify') }}
      </UButton>

      <p class="text-center text-sm text-muted">
        <UButton variant="link" size="sm" :disabled="resendIn > 0 || loading" @click="resend">
          {{ resendIn > 0 ? t('auth.otp.resendIn', { seconds: resendIn }) : t('auth.otp.resend') }}
        </UButton>
      </p>
    </template>
  </div>
</template>
