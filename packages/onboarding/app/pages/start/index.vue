<script setup lang="ts">
/**
 * Eintritt in den Setup-Flow (SAAS-ROADMAP #1).
 *
 * Schritt 0 ist das Early-Access-Tor: der Einladungs-Code wird HIER geprüft,
 * nicht am Ende. Sieben Schritte auszufüllen und dann abgewiesen zu werden
 * wäre die schlechteste mögliche erste Erfahrung mit dem Produkt.
 *
 * Die Prüfung ist nicht verbrauchend (POST /api/onboarding/precheck) — der
 * Code wird erst beim Anlegen der Community eingelöst.
 */
definePageMeta({ layout: 'onboarding', middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const draft = useOnboardingDraft()

/**
 * Der Code kann aus DREI Quellen kommen, in dieser Reihenfolge:
 *  1. `?code=` — der Direktlink aus der Einladungs-Mail. Er hat Vorrang, weil
 *     er der frischeste ist (eine Erinnerung ERSETZT den alten Code).
 *  2. der gespeicherte Entwurf — wer den Wizard verlassen hat, tippt nicht neu.
 *  3. leer — dann tippt der Eingeladene ihn ab.
 */
const route = useRoute()
const codeFromLink = typeof route.query.code === 'string' ? route.query.code.trim() : ''
const code = ref(codeFromLink || draft.value.inviteCode || '')
const checking = ref(false)
const rejected = ref(false)
/**
 * Der Code ist GÜLTIG und gehört dieser Adresse — sie ist nur noch nicht
 * bestätigt (Sicherheits-Audit 2026-08-02: ein an eine Adresse gebundener Code
 * verlangt jetzt den Nachweis, dass sie einem gehört). Eigener Zustand statt
 * `rejected`, weil hier nichts falsch ist: es fehlt ein Klick im Postfach.
 */
const needsVerification = ref(false)

// Kam der Code per Link, muss niemand auf „Weiter" drücken — das ist der
// „direkt loslegen"-Teil, den die Mail verspricht.
onMounted(() => {
  if (codeFromLink) void submit()
})

async function submit() {
  if (!code.value.trim() || checking.value) return
  checking.value = true
  rejected.value = false
  needsVerification.value = false
  try {
    const result = await $fetch<{ codeValid?: boolean, codeReason?: 'email_unverified' }>('/api/onboarding/precheck', {
      method: 'POST',
      body: { code: code.value.trim() },
    })
    if (!result.codeValid) {
      // Der EINE Grund, den die Vorprüfung nennen darf (s. control/api/
      // onboarding/precheck.post.ts) — alles andere bleibt ein stummes Nein.
      if (result.codeReason === 'email_unverified') needsVerification.value = true
      else rejected.value = true
      return
    }
    draft.value.inviteCode = code.value.trim()
    await navigateTo(localePath('/start/community'))
  }
  catch {
    rejected.value = true
  }
  finally {
    checking.value = false
  }
}

useHead({ title: () => t('onboarding.gate.title') })
</script>

<template>
  <div class="space-y-8">
    <div class="space-y-3">
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
        {{ t('onboarding.gate.heading', { name: auth.user?.name || t('onboarding.gate.fallbackName') }) }}
      </h1>
      <p class="text-muted">{{ t('onboarding.gate.intro') }}</p>
    </div>

    <form class="space-y-4" @submit.prevent="submit">
      <UFormField :label="t('onboarding.gate.codeLabel')" :description="t('onboarding.gate.codeHint')">
        <UInput
          v-model="code"
          :placeholder="t('onboarding.gate.codePlaceholder')"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          size="lg"
          class="w-full font-mono"
          :aria-invalid="rejected"
          aria-describedby="code-error"
        />
      </UFormField>

      <p v-if="rejected" id="code-error" class="flex items-start gap-2 text-sm text-error">
        <UIcon name="i-ph-warning-circle" class="mt-0.5 size-4 shrink-0" />
        {{ t('onboarding.gate.rejected') }}
      </p>

      <AuthEmailVerifyRequired v-if="needsVerification" :title="t('onboarding.gate.verifyFirst')" />

      <UButton type="submit" size="lg" :loading="checking" :disabled="!code.trim()" block>
        {{ t('onboarding.gate.submit') }}
      </UButton>
    </form>

    <p class="text-sm text-dimmed">
      {{ t('onboarding.gate.noCode') }}
    </p>
  </div>
</template>
