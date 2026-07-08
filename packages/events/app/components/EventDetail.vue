<script setup lang="ts">
import type { EventDetailResponse, EventRow, RsvpResponse, RsvpStatus } from '../../shared/types/event'
import { effectiveLocationType, EVENTS_TABLE } from '../../shared/types/event'
import { detectLiveProvider } from '../../shared/liveProvider'

/**
 * Landing Page eines Events: Cover (oder Theme-Fallback), Countdown-Pill,
 * Host mit Avatar, Kern-Infos, Avatar-Stack der Zusager, Knappheits-Label,
 * RSVP-Buttons, „Join live"-Fenster (T−15 min bis Ende, nur Zusager),
 * Replay-Link, ICS-Download, Share, Betrachtungs-Presence. Teilnehmerzahl
 * LIVE via useRealtimeRows auf der einen Row. Kommentare kommen über den
 * #comments-Slot — die APP füllt ihn mit dem comments-Layer (A14).
 */
const props = defineProps<{ initial: EventDetailResponse }>()

const { t } = useI18n()
const toast = useToast()
const config = useRuntimeConfig()
const { formatDateTime, formatTime, formatMonthShort, sameDay } = useEventDateFormat()
const { formatRelativeTime } = useFormatRelativeTime()
const { coverUrl } = useEventCover()

// Lokale Wahrheit: Realtime-Updates und RSVP-Antworten ersetzen sie atomar
const event = ref<EventRow>({ ...props.initial })
const myRsvp = ref<RsvpStatus | null>(props.initial.myRsvp)

// „Jetzt" als Ref — Countdown-Pill und Join-live-Fenster reagieren ohne Reload
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined

// Hooks VOR dem ersten await (async-setup-Regel); Stop-Funktion selbst
// halten — in onMounted gibt es keinen aktiven Effect-Scope (Muster PostFeed)
let stopRealtime: (() => void) | undefined
onMounted(() => {
  ticker = setInterval(() => { now.value = Date.now() }, 30_000)
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
onBeforeUnmount(() => {
  stopRealtime?.()
  if (ticker) clearInterval(ticker)
})

// „N sehen dieses Event" — Presence über den Core-Vertrag
const { count: viewerCount } = useViewingPresence()

function onRsvpUpdated(res: RsvpResponse) {
  event.value = { ...res.event }
  myRsvp.value = res.myRsvp
}

const isFull = computed(() =>
  event.value.capacity !== null && event.value.attendeeCount >= event.value.capacity,
)
/** Knappheit: ≤3 Restplätze, aber noch nicht voll */
const spotsLeft = computed(() => {
  if (event.value.capacity === null) return null
  const left = event.value.capacity - event.value.attendeeCount
  return left > 0 && left <= 3 ? left : null
})

const isUpcoming = computed(() => Date.parse(event.value.startAt) > now.value)
const locationType = computed(() => effectiveLocationType(event.value))
const provider = computed(() => detectLiveProvider(event.value.url))

/** Join-Fenster: T−15 min bis endAt (ohne endAt: 3 h nach Start) — nur Zusager */
const JOIN_LEAD_MS = 15 * 60_000
const FALLBACK_DURATION_MS = 3 * 3600_000
const joinOpen = computed(() => {
  if (event.value.status !== 'published' || locationType.value !== 'online' || !event.value.url) return false
  const start = Date.parse(event.value.startAt)
  const end = event.value.endAt ? Date.parse(event.value.endAt) : start + FALLBACK_DURATION_MS
  return now.value >= start - JOIN_LEAD_MS && now.value <= end
})

async function share() {
  const url = window.location.href
  try {
    if (navigator.share) {
      await navigator.share({ title: event.value.title, url })
      return
    }
    throw new Error('no-share')
  }
  catch {
    try {
      await navigator.clipboard.writeText(url)
      toast.add({ title: t('events.detail.linkCopied'), color: 'success' })
    }
    catch {
      toast.add({ title: t('events.detail.shareFailed'), color: 'error' })
    }
  }
}

const start = computed(() => new Date(event.value.startAt))
const coverDay = computed(() => start.value.getDate())
</script>

<template>
  <article>
    <!-- Cover — Upload oder Theme-Farbfläche mit Datum-Block (Fallback, §8.4) -->
    <div class="relative mb-6 overflow-hidden rounded-xl">
      <img
        v-if="event.coverFileId"
        :src="coverUrl(event.coverFileId)"
        :alt="event.title"
        class="aspect-[3/1] w-full object-cover"
        data-testid="event-cover"
      >
      <div
        v-else
        class="flex aspect-[3/1] w-full items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-elevated"
        data-testid="event-cover-fallback"
      >
        <div class="flex h-20 w-20 flex-col items-center justify-center rounded-xl bg-default/80 text-center shadow-sm">
          <span class="text-2xl leading-tight font-bold">{{ coverDay }}</span>
          <span class="text-xs text-muted uppercase">{{ formatMonthShort(event.startAt) }}</span>
        </div>
      </div>

      <!-- ClientOnly: der Relativ-Text tickt — SSR-Text wäre Sekunden alt (Hydration-Drift) -->
      <ClientOnly>
        <UBadge
          v-if="event.status === 'published' && isUpcoming"
          color="success"
          variant="solid"
          class="absolute top-3 left-3"
          data-testid="event-countdown"
        >
          {{ t('events.detail.startsIn', { when: formatRelativeTime(event.startAt) }) }}
        </UBadge>
      </ClientOnly>
    </div>

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
        <div v-if="event.organizerName" class="mt-2 flex items-center gap-2 text-sm text-muted">
          <UAvatar :src="initial.organizerAvatarUrl ?? undefined" :alt="event.organizerName" size="xs" />
          <span>{{ t('events.detail.organizer', { name: event.organizerName }) }}</span>
        </div>
      </div>

      <div class="flex shrink-0 gap-2">
        <UButton
          color="neutral" variant="outline" size="sm" icon="i-ph-share-network"
          data-testid="event-share" @click="share"
        >
          {{ t('events.detail.share') }}
        </UButton>
        <UButton
          :href="`/api/events/${event.$id}/ics`" external
          color="neutral" variant="outline" size="sm" icon="i-ph-calendar-plus"
          data-testid="event-ics"
        >
          {{ t('events.detail.ics') }}
        </UButton>
      </div>
    </div>

    <dl class="mt-6 space-y-2 text-sm">
      <div class="flex items-center gap-2">
        <UIcon name="i-ph-clock" class="size-4 shrink-0 text-muted" />
        <span data-testid="event-time">
          {{ formatDateTime(event.startAt) }}<template v-if="event.endAt">
            – {{ sameDay(event.startAt, event.endAt) ? formatTime(event.endAt) : formatDateTime(event.endAt) }}</template>
        </span>
      </div>

      <div v-if="locationType === 'online'" class="flex items-center gap-2" data-testid="event-online">
        <UIcon :name="provider.icon" class="size-4 shrink-0 text-muted" />
        <span>{{ provider.label || t('events.detail.online') }}</span>
      </div>
      <div v-else-if="event.location" class="flex items-center gap-2">
        <UIcon name="i-ph-map-pin" class="size-4 shrink-0 text-muted" />
        <span>{{ event.location }}</span>
      </div>

      <div v-if="event.url && locationType === 'online' && !joinOpen" class="flex items-center gap-2">
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
        <span v-if="spotsLeft" class="font-medium text-warning" data-testid="event-scarcity">
          {{ t('events.detail.spotsLeft', { count: spotsLeft }) }}
        </span>
      </div>

      <div v-if="initial.attendeePreview.length > 0" class="flex items-center gap-2" data-testid="event-avatar-stack">
        <UAvatarGroup size="xs" :max="5">
          <UAvatar
            v-for="attendee in initial.attendeePreview"
            :key="attendee.userId"
            :src="attendee.avatarUrl ?? undefined"
            :alt="t('events.detail.attendee')"
          />
        </UAvatarGroup>
        <span class="text-xs text-muted">{{ t('events.card.attendees', { count: event.attendeeCount }) }}</span>
      </div>

      <ClientOnly>
        <div v-if="viewerCount > 1" class="flex items-center gap-2 text-muted" data-testid="event-viewers">
          <UIcon name="i-ph-eye" class="size-4 shrink-0" />
          <span>{{ t('events.detail.viewers', { count: viewerCount }) }}</span>
        </div>
      </ClientOnly>
    </dl>

    <!-- Join live: T−15 min bis Ende, nur für Zusager (EVENTS-V2 §2) -->
    <ClientOnly>
      <UButton
        v-if="joinOpen && myRsvp === 'going'"
        :href="event.url!" external target="_blank"
        color="primary" size="lg" icon="i-ph-broadcast"
        class="mt-6"
        data-testid="event-join-live"
      >
        {{ t('events.detail.joinLive') }}
      </UButton>
    </ClientOnly>

    <!-- Replay — das Event lebt als Content weiter -->
    <UButton
      v-if="event.replayUrl"
      :href="event.replayUrl" external target="_blank"
      color="neutral" variant="soft" size="sm" icon="i-ph-play-circle"
      class="mt-6"
      data-testid="event-replay"
    >
      {{ t('events.detail.replay') }}
    </UButton>

    <div class="mt-6">
      <RsvpButtons :event="event" :my-rsvp="myRsvp" @updated="onRsvpUpdated" />
    </div>

    <p class="mt-8 text-sm leading-relaxed whitespace-pre-line" data-testid="event-description">{{ event.description }}</p>

    <div class="mt-10">
      <slot name="comments" :event="event" />
    </div>
  </article>
</template>
