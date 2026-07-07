<script setup lang="ts">
import type { EventRow, EventWithRsvp, RsvpResponse, RsvpStatus } from '../../shared/types/event'
import { EVENTS_TABLE } from '../../shared/types/event'

/**
 * Detail-Ansicht: Kern-Infos, RSVP-Buttons mit eigenem Status, Teilnehmerzahl
 * LIVE (useRealtimeRows auf der einen Row — RSVPs anderer springen ohne
 * Reload), ICS-Download, Betrachtungs-Presence („N sehen dieses Event").
 * Kommentare kommen über den #comments-Slot — die APP füllt ihn mit dem
 * comments-Layer (A14-Komposition), der Layer kennt comments nicht.
 */
const props = defineProps<{ initial: EventWithRsvp }>()

const { t } = useI18n()
const config = useRuntimeConfig()
const { formatDateTime, formatTime, sameDay } = useEventDateFormat()

// Lokale Wahrheit: Realtime-Updates und RSVP-Antworten ersetzen sie atomar
const event = ref<EventRow>({ ...props.initial })
const myRsvp = ref<RsvpStatus | null>(props.initial.myRsvp)

// Hooks VOR dem ersten await (async-setup-Regel — sonst kein Realtime!).
// Stop-Funktion selbst halten: in onMounted gibt es keinen aktiven Effect-
// Scope für onScopeDispose (Muster PostFeed).
let stopRealtime: (() => void) | undefined
onMounted(() => {
  stopRealtime = useRealtimeRows<EventRow>(
    config.public.appwriteDatabaseId,
    EVENTS_TABLE,
    (ev) => {
      if (ev.type === 'delete') return
      event.value = { ...ev.payload }
    },
    { rowId: props.initial.$id },
  )
})
onBeforeUnmount(() => stopRealtime?.())

// „N sehen dieses Event" — Presence über den Core-Vertrag (nur Mitglieder
// broadcaste(t)n; Gäste sehen die Zeile schlicht nicht)
const { count: viewerCount } = useViewingPresence()

function onRsvpUpdated(res: RsvpResponse) {
  event.value = { ...res.event }
  myRsvp.value = res.myRsvp
}

const isFull = computed(() =>
  event.value.capacity !== null && event.value.attendeeCount >= event.value.capacity,
)
</script>

<template>
  <article>
    <UAlert
      v-if="event.status === 'cancelled'"
      color="error"
      variant="subtle"
      icon="i-ph-calendar-x"
      :title="t('events.detail.cancelled')"
      class="mb-6"
      data-testid="event-cancelled"
    />

    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold" :class="{ 'line-through opacity-60': event.status === 'cancelled' }">
          {{ event.title }}
        </h1>
        <p v-if="event.organizerName" class="mt-1 text-sm text-muted">
          {{ t('events.detail.organizer', { name: event.organizerName }) }}
        </p>
      </div>

      <UButton
        :href="`/api/events/${event.$id}/ics`"
        external
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-ph-calendar-plus"
        data-testid="event-ics"
      >
        {{ t('events.detail.ics') }}
      </UButton>
    </div>

    <dl class="mt-6 space-y-2 text-sm">
      <div class="flex items-center gap-2">
        <UIcon name="i-ph-clock" class="size-4 shrink-0 text-muted" />
        <span data-testid="event-time">
          {{ formatDateTime(event.startAt) }}<template v-if="event.endAt">
            – {{ sameDay(event.startAt, event.endAt) ? formatTime(event.endAt) : formatDateTime(event.endAt) }}</template>
        </span>
      </div>
      <div v-if="event.location" class="flex items-center gap-2">
        <UIcon name="i-ph-map-pin" class="size-4 shrink-0 text-muted" />
        <span>{{ event.location }}</span>
      </div>
      <div v-if="event.url" class="flex items-center gap-2">
        <UIcon name="i-ph-link" class="size-4 shrink-0 text-muted" />
        <a :href="event.url" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">
          {{ t('events.detail.link') }}
        </a>
      </div>
      <div class="flex items-center gap-2">
        <UIcon name="i-ph-users" class="size-4 shrink-0 text-muted" />
        <span data-testid="event-attendees">
          {{ event.capacity !== null
            ? t('events.card.attendeesOfCapacity', { count: event.attendeeCount, capacity: event.capacity })
            : t('events.card.attendees', { count: event.attendeeCount }) }}
          <template v-if="isFull && event.status === 'published'"> · {{ t('events.card.full') }}</template>
        </span>
      </div>
      <ClientOnly>
        <div v-if="viewerCount > 1" class="flex items-center gap-2 text-muted" data-testid="event-viewers">
          <UIcon name="i-ph-eye" class="size-4 shrink-0" />
          <span>{{ t('events.detail.viewers', { count: viewerCount }) }}</span>
        </div>
      </ClientOnly>
    </dl>

    <div class="mt-6">
      <RsvpButtons :event="event" :my-rsvp="myRsvp" @updated="onRsvpUpdated" />
    </div>

    <p class="mt-8 text-sm leading-relaxed whitespace-pre-line" data-testid="event-description">{{ event.description }}</p>

    <div class="mt-10">
      <slot name="comments" :event="event" />
    </div>
  </article>
</template>
