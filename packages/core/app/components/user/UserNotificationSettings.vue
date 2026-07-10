<script setup lang="ts">
/**
 * E-Mail-Benachrichtigungs-Präferenz (Settings → Benachrichtigungen):
 * Aus · Sofort · Täglicher Digest. Opt-in (Default aus); die Mail-Sprache
 * ist die UI-Sprache beim Speichern (der Server kennt die User-Locale nicht).
 */
type EmailMode = 'off' | 'instant' | 'digest'

const { t, locale } = useI18n()
const toast = useToast()
const loading = ref(false)

const { data } = await useFetch<{ emailNotifications: EmailMode, mailerConfigured: boolean }>('/api/auth/notification-prefs')

const mode = ref<EmailMode>('off')
watchEffect(() => {
  if (data.value) mode.value = data.value.emailNotifications
})

const items = computed(() => [
  { value: 'off', label: t('notifications.email.off'), description: t('notifications.email.offDesc') },
  { value: 'instant', label: t('notifications.email.instant'), description: t('notifications.email.instantDesc') },
  { value: 'digest', label: t('notifications.email.digest'), description: t('notifications.email.digestDesc') },
])

async function save() {
  loading.value = true
  try {
    await $fetch('/api/auth/notification-prefs', {
      method: 'PUT',
      body: {
        emailNotifications: mode.value,
        emailLocale: locale.value === 'de' ? 'de' : 'en',
      },
    })
    toast.add({ title: t('notifications.email.saved'), color: 'success' })
  }
  catch {
    toast.add({ title: t('notifications.email.saveFailed'), color: 'error' })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-4" data-notification-settings>
    <UAlert
      v-if="data && !data.mailerConfigured"
      color="warning"
      variant="subtle"
      icon="i-ph-envelope-simple-open"
      :title="t('notifications.email.noSmtp')"
    />

    <URadioGroup v-model="mode" :items="items" data-notification-mode />

    <div class="flex justify-end">
      <UButton :loading="loading" data-notification-save @click="save">
        {{ t('notifications.email.save') }}
      </UButton>
    </div>
  </div>
</template>
