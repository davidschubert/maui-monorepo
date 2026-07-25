<script setup lang="ts">
/**
 * Early Access anfragen — die einzige öffentliche Seite des Trichters.
 *
 * Liegt auf dem Kundenbereich-Host (nicht auf der Landingpage), damit das
 * Formular ohne Cross-Origin auskommt: die Marketing-Seite verlinkt hierher.
 *
 * Nach dem Absenden bleibt die Seite bewusst auf einer ruhigen Danke-Ansicht
 * stehen — kein Redirect. Wer gerade seine Adresse hinterlassen hat, will
 * sehen, dass es angekommen ist.
 */
definePageMeta({ layout: 'onboarding' })
defineI18nRoute({ paths: { de: '/anfragen', en: '/request-access' } })

const { t, locale } = useI18n()
const localePath = useLocalePath()

const email = ref('')
const note = ref('')
/** Honeypot: für Menschen unsichtbar, für Bots verlockend. */
const website = ref('')
const sending = ref(false)
const sent = ref(false)
const failed = ref(false)

async function submit() {
  if (!email.value.trim() || sending.value) return
  sending.value = true
  failed.value = false
  try {
    await $fetch('/api/onboarding/request', {
      method: 'POST',
      body: {
        email: email.value.trim(),
        note: note.value.trim(),
        locale: locale.value,
        ...(website.value ? { website: website.value } : {}),
      },
    })
    sent.value = true
  }
  catch {
    failed.value = true
  }
  finally {
    sending.value = false
  }
}

useHead({ title: () => t('onboarding.request.title') })
</script>

<template>
  <div class="space-y-8">
    <template v-if="sent">
      <div class="space-y-3">
        <span class="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <UIcon name="i-ph-paper-plane-tilt" class="size-6" />
        </span>
        <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{{ t('onboarding.request.doneTitle') }}</h1>
        <p class="text-muted">{{ t('onboarding.request.doneBody') }}</p>
      </div>
      <p class="text-sm text-dimmed">{{ t('onboarding.request.doneHint') }}</p>
    </template>

    <template v-else>
      <div class="space-y-3">
        <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{{ t('onboarding.request.title') }}</h1>
        <p class="text-muted">{{ t('onboarding.request.intro') }}</p>
      </div>

      <form class="space-y-5" @submit.prevent="submit">
        <UFormField :label="t('onboarding.request.emailLabel')" :description="t('onboarding.request.emailHint')">
          <UInput v-model="email" type="email" required autocomplete="email" size="lg" class="w-full" autofocus />
        </UFormField>

        <UFormField :label="t('onboarding.request.noteLabel')" :description="t('onboarding.request.noteHint')">
          <UTextarea v-model="note" :rows="4" :maxlength="500" class="w-full" :placeholder="t('onboarding.request.notePlaceholder')" />
        </UFormField>

        <!-- Honeypot: aus dem Layout genommen und für Screenreader versteckt -->
        <div class="hidden" aria-hidden="true">
          <label>
            Website
            <input v-model="website" type="text" tabindex="-1" autocomplete="off">
          </label>
        </div>

        <p v-if="failed" class="flex items-start gap-2 text-sm text-error">
          <UIcon name="i-ph-warning-circle" class="mt-0.5 size-4 shrink-0" />
          {{ t('onboarding.request.failed') }}
        </p>

        <UButton type="submit" size="lg" :loading="sending" :disabled="!email.trim()" block>
          {{ t('onboarding.request.submit') }}
        </UButton>

        <p class="text-xs text-dimmed">{{ t('onboarding.request.privacy') }}</p>
      </form>

      <p class="text-sm text-dimmed">
        {{ t('onboarding.request.hasCode') }}
        <NuxtLink :to="localePath('/start')" class="font-medium underline">{{ t('onboarding.request.hasCodeLink') }}</NuxtLink>
      </p>
    </template>
  </div>
</template>
