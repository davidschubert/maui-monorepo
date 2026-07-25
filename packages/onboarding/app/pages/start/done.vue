<script setup lang="ts">
/**
 * Schritt 8 — der erste Einblick.
 *
 * Diese Seite ist in O4 bewusst schlicht: sie bestätigt, was entstanden ist,
 * und verlinkt die Community. Das Willkommensfenster IN der Community, die
 * erzeugte Startseite und der Session-Handoff (damit man dort auch eingeloggt
 * ankommt) sind eigener Bau — O6.
 */
definePageMeta({ layout: 'onboarding', middleware: 'auth' })

const { t } = useI18n()
const route = useRoute()
const draft = useOnboardingDraft()

const host = computed(() => String(route.query.host ?? ''))
const siteId = computed(() => String(route.query.site ?? ''))
// Der Name kommt aus dem Entwurf; nach dem Leeren (unten) bleibt er in dieser
// Kopie stehen, damit die Überschrift beim Neuladen nicht leer wird.
const name = ref(draft.value.name ?? '')

// Der Entwurf hat seinen Zweck erfüllt — er darf nicht im Tab liegen bleiben
// und beim nächsten „Neue Community" mit alten Antworten auftauchen.
onMounted(() => clearOnboardingDraft())

/**
 * Schritt 9: in der Community ankommen — EINGELOGGT.
 *
 * Session-Cookies sind host-only, die Anmeldung auf app.* gilt auf der
 * Subdomain also nicht. Deshalb wird beim KLICK ein 60-Sekunden-Handoff-Token
 * gesiegelt (nicht beim Rendern: bei einem langsamen Leser wäre es abgelaufen),
 * das der Community-Host gegen Appwrite prüft, bevor er sein Cookie setzt.
 *
 * Scheitert der Handoff, führt der Link trotzdem zur Community — dann eben mit
 * Login. Ein kaputter Handoff darf keine Sackgasse sein.
 */
const opening = ref(false)

async function openCommunity() {
  if (!host.value || opening.value) return
  opening.value = true
  let target = `https://${host.value}/`
  try {
    const { token } = await $fetch<{ token: string }>('/api/onboarding/handoff', {
      method: 'POST',
      body: { siteId: siteId.value },
    })
    target = `https://${host.value}/api/auth/site-session?token=${encodeURIComponent(token)}&to=%2F`
  }
  catch {
    // Fallback: ohne Handoff wenigstens zur Community (dort Login).
  }
  window.location.href = target
}

useHead({ title: () => t('onboarding.done.title') })
</script>

<template>
  <div class="space-y-8">
    <div class="space-y-3">
      <span class="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        <UIcon name="i-ph-sun-horizon" class="size-6" />
      </span>
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
        {{ t('onboarding.done.heading', { name }) }}
      </h1>
      <p class="text-muted">{{ t('onboarding.done.intro') }}</p>
    </div>

    <div class="space-y-4 rounded-xl border border-default p-5">
      <div class="space-y-1">
        <p class="text-sm text-muted">{{ t('onboarding.done.addressLabel') }}</p>
        <p class="break-all font-medium">{{ host }}</p>
      </div>
      <UButton
        v-if="host"
        type="button"
        size="lg"
        :loading="opening"
        trailing-icon="i-ph-arrow-up-right"
        block
        @click="openCommunity"
      >
        {{ t('onboarding.done.open') }}
      </UButton>
    </div>

    <ul class="space-y-3 text-sm">
      <li v-for="hint in ['private', 'trial', 'settings']" :key="hint" class="flex items-start gap-3">
        <UIcon name="i-ph-check-circle" class="mt-0.5 size-4 shrink-0 text-primary" />
        <span class="text-muted">{{ t(`onboarding.done.hints.${hint}`) }}</span>
      </li>
    </ul>
  </div>
</template>
