<script setup lang="ts">
import type { EventRow, RsvpResponse, RsvpStatus } from '../../shared/types/event'

/**
 * RSVP-Dreiklang (Zusagen/Vielleicht/Absagen) mit Toggle-Semantik: der eigene
 * Status ist hervorgehoben, erneutes Klicken zieht die RSVP zurück. Gäste
 * sehen einen Login-CTA. „Zusagen" sperrt, wenn das Event voll ist (außer
 * man IST der Zusagende) oder nicht mehr offen.
 */
const props = defineProps<{
  event: EventRow
  myRsvp: RsvpStatus | null
}>()

const emit = defineEmits<{ updated: [response: RsvpResponse] }>()

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const { isLoggedIn } = useCurrentUser()

const busy = ref<RsvpStatus | ''>('')

const isFull = computed(() =>
  props.event.capacity !== null && props.event.attendeeCount >= props.event.capacity,
)
const open = computed(() => props.event.status === 'published')

const options: Array<{ status: RsvpStatus, icon: string, labelKey: string }> = [
  { status: 'going', icon: 'i-ph-check-bold', labelKey: 'events.rsvp.going' },
  { status: 'maybe', icon: 'i-ph-question', labelKey: 'events.rsvp.maybe' },
  { status: 'declined', icon: 'i-ph-x', labelKey: 'events.rsvp.declined' },
]

async function setRsvp(status: RsvpStatus) {
  busy.value = status
  try {
    const res = await $fetch<RsvpResponse>(`/api/events/${props.event.$id}/rsvp`, {
      method: 'POST',
      body: { status },
    })
    // Jede Rückmeldung zählt (auch Absage/Umentscheiden): das Ereignis ist
    // „hat reagiert", die Verteilung steht in der Teilnehmerliste.
    trackAnalyticsEvent('eventRsvp')
    emit('updated', res)
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    // EIN Grund entscheidet über BEIDE Zeilen: unter „ausgebucht" darf kein
    // Netzwerk-Rat stehen (Audit-Befund C12 — Fehler ohne nächsten Schritt).
    const reason = statusCode === 403 && status === 'going'
      ? 'ticketRequired'
      : statusCode === 409 && status === 'going' ? 'full' : 'failed'
    toast.add({
      title: t(`events.rsvp.${reason}`),
      description: t(`events.rsvp.${reason}Hint`),
      color: 'error',
    })
  }
  finally {
    busy.value = ''
  }
}
</script>

<template>
  <div v-if="!isLoggedIn" data-testid="rsvp-login">
    <UButton :to="localePath('/login')" color="primary" variant="soft" icon="i-ph-sign-in">
      {{ t('events.rsvp.loginCta') }}
    </UButton>
  </div>

  <div v-else class="flex flex-wrap items-center gap-2" data-testid="rsvp-buttons">
    <UButton
      v-for="option in options"
      :key="option.status"
      :icon="option.icon"
      :color="myRsvp === option.status ? (option.status === 'declined' ? 'neutral' : 'primary') : 'neutral'"
      :variant="myRsvp === option.status ? 'solid' : 'outline'"
      :loading="busy === option.status"
      :disabled="!open || (option.status === 'going' && isFull && myRsvp !== 'going')"
      :data-rsvp="option.status"
      :aria-pressed="myRsvp === option.status"
      @click="setRsvp(option.status)"
    >
      {{ t(option.labelKey) }}
    </UButton>
  </div>
</template>
