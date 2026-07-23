<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createOtpRequestSchema, type OtpRequestInput } from '../../../schemas/auth'

const props = defineProps<{
  /** true = Registrierungs-Kontext: eigene Texte, AGB-Pflicht bei termsUrl */
  register?: boolean
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const appConfig = useAppConfig()
const auth = useAuthStore()
const { completeEmbedLogin } = useEmbedPopup()
const toast = useToast()

const step = ref<'email' | 'code'>('email')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

// AGB nur im register-Modus erzwingen — Login bestehender User bleibt friktionsfrei
const termsUrl = computed(() => appConfig.maui?.auth?.termsUrl ?? '')
const requireTerms = computed(() => props.register === true && termsUrl.value.length > 0)

const schema = computed(() => createOtpRequestSchema(t, {
  requireTerms: requireTerms.value,
  requireName: props.register === true,
}))

// E-Mail + Name teilen sich den State mit Login/Register (Flow-Wechsel)
const sharedEmail = useState('maui-auth-email', () => '')
const sharedName = useState('maui-auth-name', () => '')
const state = reactive<OtpRequestInput>({
  email: sharedEmail.value,
  name: props.register ? sharedName.value : '',
  terms: false,
})
// Namen nur im Register-Kontext mit dem Passwort-Register-Formular teilen
watch(() => state.name, (value) => { if (props.register) sharedName.value = value ?? '' })

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

async function requestToken() {
  const response = await $fetch<{ ok: boolean, userId: string, phrase: string }>('/api/auth/otp', {
    method: 'POST',
    body: { email: state.email },
  })
  userId.value = response.userId
  phrase.value = response.phrase
  startCountdown()
}

async function requestCode(event: FormSubmitEvent<OtpRequestInput>) {
  loading.value = true
  errorMessage.value = null
  try {
    sharedEmail.value = event.data.email
    await requestToken()
    code.value = []
    step.value = 'code'
  }
  catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (isNetworkError(error)) errorMessage.value = t('auth.networkError')
    else if (props.register && status === 403) errorMessage.value = t('auth.register.disabled')
    else errorMessage.value = t('auth.otp.requestFailed')
  }
  finally {
    loading.value = false
  }
}

async function resend() {
  if (resendIn.value > 0) return
  loading.value = true
  errorMessage.value = null
  try {
    await requestToken()
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

    // Optionaler Name — NUR setzen, wenn der Account noch keinen hat
    // (Auto-Signup legt User mit leerem Namen an; Bestandsnamen bleiben unangetastet)
    const pendingName = state.name?.trim() ?? ''
    if (pendingName.length >= 2 && auth.user && auth.user.name === '') {
      try {
        await $fetch('/api/auth/profile', { method: 'PUT', body: { name: pendingName } })
        await auth.refresh()
      }
      catch {
        // Name setzen fehlgeschlagen — Login bleibt trotzdem erfolgreich
      }
    }

    // Embed-Popup (E2): Session ans iframe übergeben statt zu navigieren
    if (await completeEmbedLogin()) return
    toast.add({ title: t('auth.login.success'), color: 'success', icon: 'i-ph-check-circle' })
    await navigateTo(localePath('/'))
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
      <h1 class="mt-2 text-xl font-semibold">
        {{ register ? t('auth.otp.registerTitle') : t('auth.otp.title') }}
      </h1>
      <p class="text-sm text-muted">
        {{ step === 'email'
          ? (register ? t('auth.otp.registerDescription') : t('auth.otp.description'))
          : t('auth.otp.codeDescription', { email: state.email }) }}
      </p>
    </div>

    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />

    <UForm v-if="step === 'email'" :schema="schema" :validate-on="[]" :state="state" class="space-y-4" @submit="requestCode">
      <!-- Name nur im Register-Kontext — auf /login hat der User längst einen -->
      <UFormField v-if="register" :label="t('auth.fields.name')" name="name" required>
        <UInput v-model="state.name" size="lg" :placeholder="t('auth.fields.namePlaceholder')" class="w-full" />
      </UFormField>
      <UFormField :label="t('auth.fields.email')" name="email" required>
        <UInput v-model="state.email" type="email" size="lg" :placeholder="t('auth.fields.emailPlaceholder')" class="w-full" />
      </UFormField>
      <UFormField v-if="requireTerms" name="terms">
        <UCheckbox v-model="state.terms" :label="t('auth.register.termsLabel')" />
      </UFormField>
      <UButton type="submit" block size="lg" :loading="loading">{{ t('auth.otp.requestCode') }}</UButton>
      <p v-if="requireTerms" class="text-center">
        <ULink :to="termsUrl" target="_blank" class="text-sm text-muted hover:text-primary">
          {{ t('auth.register.termsLink') }}
        </ULink>
      </p>
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
