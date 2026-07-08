<script setup lang="ts">
import type { EventDetailResponse, EventRow, EventVoteResponse, EventVoteValue, RsvpResponse, RsvpStatus } from '../../shared/types/event'
import { effectiveLocationType, EVENTS_TABLE } from '../../shared/types/event'
import { detectLiveProvider } from '../../shared/liveProvider'

/**
 * Landing Page (Meetup-Muster): Zurück-Link, links Titel/Host/Details
 * (Markdown, geklappt)/Votes/Teilnehmer/Kommentare — rechts die sticky
 * Info-Karte (Cover, Zeitfenster, Ort inkl. Google-Maps-Link „So findest
 * du uns", RSVP, Join live, ICS/Share). Teilnehmerzahl LIVE via
 * useRealtimeRows; Namen/Avatare nur für Eingeloggte (Privacy-Gate —
 * Gäste sehen geblurte Platzhalter). Kommentare kommen über den
 * #comments-Slot — die APP füllt ihn mit dem comments-Layer (A14).
 */
const props = defineProps<{ initial: EventDetailResponse }>()

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const config = useRuntimeConfig()
const { formatDateTime, formatTime, formatMonthShort, formatDateSpan, isMultiDay, sameDay } = useEventDateFormat()
const { formatRelativeTime } = useFormatRelativeTime()
const { coverUrl } = useEventCover()
const { isLoggedIn } = useCurrentUser()

// Lokale Wahrheit: Realtime-Updates und RSVP-/Vote-Antworten ersetzen sie atomar
const event = ref<EventRow>({ ...props.initial })
const myRsvp = ref<RsvpStatus | null>(props.initial.myRsvp)
const myVote = ref<EventVoteValue | null>(props.initial.myVote)

// „Jetzt" als Ref — Countdown-Pill und Join-live-Fenster reagieren ohne Reload
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined

// Hooks VOR dem ersten await; Stop-Funktion selbst halten (Muster PostFeed)
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

const { count: viewerCount } = useViewingPresence()

function onRsvpUpdated(res: RsvpResponse) {
  event.value = { ...res.event }
  myRsvp.value = res.myRsvp
}
function onVoted(res: EventVoteResponse) {
  event.value = { ...res.event }
  myVote.value = res.myVote
}

const isFull = computed(() =>
  event.value.capacity !== null && event.value.attendeeCount >= event.value.capacity,
)
const spotsLeft = computed(() => {
  if (event.value.capacity === null) return null
  const left = event.value.capacity - event.value.attendeeCount
  return left > 0 && left <= 3 ? left : null
})

const isUpcoming = computed(() => Date.parse(event.value.startAt) > now.value)
const locationType = computed(() => effectiveLocationType(event.value))
const provider = computed(() => detectLiveProvider(event.value.url))

/** Google-Maps-Suche mit den Adressdaten — öffnet im neuen Fenster */
const mapsUrl = computed(() => {
  const target = [event.value.location, event.value.address].filter(Boolean).join(', ')
  return target ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}` : null
})

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

// ---- Melden (generischer moderation-Vertrag, targetType 'event') ----

const REPORT_REASONS = ['spam', 'harassment', 'offtopic', 'other'] as const
const reportBusy = ref(false)

async function report(reason: string) {
  reportBusy.value = true
  try {
    await $fetch('/api/reports', {
      method: 'POST',
      body: { targetType: 'event', targetId: event.value.$id, reason },
    })
    toast.add({ title: t('events.report.done'), color: 'success' })
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    toast.add({
      title: statusCode === 409 ? t('events.report.already') : t('events.report.failed'),
      color: statusCode === 409 ? 'info' : 'error',
    })
  }
  finally {
    reportBusy.value = false
  }
}

const reportItems = computed(() => REPORT_REASONS.map(reason => ({
  label: t(`events.report.reasons.${reason}`),
  onSelect: () => report(reason),
})))

/** Gäste: geblurte Platzhalter statt echter Teilnehmer */
const placeholderCount = computed(() => Math.min(event.value.attendeeCount, 8))

const start = computed(() => new Date(event.value.startAt))
</script>

<template>
  <article>
    <UButton
      :to="localePath('/events')"
      color="neutral"
      variant="ghost"
      size="sm"
      icon="i-ph-arrow-left"
      class="mb-4"
      data-testid="event-back"
    >
      {{ t('events.detail.back') }}
    </UButton>

    <UAlert
      v-if="event.status === 'cancelled'"
      color="error"
      variant="subtle"
      icon="i-ph-calendar-x"
      :title="t('events.detail.cancelled')"
      class="mb-6"
      data-testid="event-cancelled"
    />

    <div class="gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <!-- Sidebar (mobil zuerst: Cover + Fakten oben, wie Meetup mobile) -->
      <aside class="order-first mb-6 lg:sticky lg:top-4 lg:order-last lg:mb-0">
        <div class="overflow-hidden rounded-xl border border-default">
          <div class="relative">
            <img
              v-if="event.coverFileId"
              :src="coverUrl(event.coverFileId)"
              :alt="event.title"
              class="aspect-video w-full object-cover"
              data-testid="event-cover"
            >
            <div
              v-else
              class="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-elevated"
              data-testid="event-cover-fallback"
            >
              <div class="flex h-16 w-16 flex-col items-center justify-center rounded-xl bg-default/80 text-center shadow-sm">
                <span class="text-xl leading-tight font-bold">{{ start.getDate() }}</span>
                <span class="text-xs text-muted uppercase">{{ formatMonthShort(event.startAt) }}</span>
              </div>
            </div>
            <ClientOnly>
              <UBadge
                v-if="event.status === 'published' && isUpcoming"
                color="success" variant="solid" class="absolute top-2 left-2"
                data-testid="event-countdown"
              >
                {{ t('events.detail.startsIn', { when: formatRelativeTime(event.startAt) }) }}
              </UBadge>
            </ClientOnly>
          </div>

          <div class="space-y-3 p-4 text-sm">
            <div class="flex items-start gap-2">
              <UIcon name="i-ph-clock" class="mt-0.5 size-4 shrink-0 text-muted" />
              <div data-testid="event-time">
                <p class="font-medium">{{ formatDateSpan(event.startAt, event.endAt) }}</p>
                <p v-if="event.endAt && sameDay(event.startAt, event.endAt)" class="text-muted">
                  {{ formatTime(event.startAt) }} – {{ formatTime(event.endAt) }}
                </p>
                <p v-else-if="isMultiDay(event.startAt, event.endAt)" class="text-muted" data-testid="event-multiday">
                  {{ t('events.detail.multiDay', { from: formatDateTime(event.startAt), to: formatDateTime(event.endAt!) }) }}
                </p>
              </div>
            </div>

            <div v-if="locationType === 'online'" class="flex items-center gap-2" data-testid="event-online">
              <UIcon :name="provider.icon" class="size-4 shrink-0 text-muted" />
              <span>{{ t('events.card.online') }}<template v-if="provider.label"> · {{ provider.label }}</template></span>
            </div>
            <div v-else-if="event.location || event.address" class="flex items-start gap-2">
              <UIcon name="i-ph-map-pin" class="mt-0.5 size-4 shrink-0 text-muted" />
              <div class="min-w-0">
                <p v-if="event.location">{{ event.location }}</p>
                <p v-if="event.address" class="text-muted">{{ event.address }}</p>
                <a
                  v-if="mapsUrl"
                  :href="mapsUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-primary hover:underline"
                  data-testid="event-maps"
                >
                  {{ t('events.detail.findUs') }}
                </a>
              </div>
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

            <ClientOnly>
              <div v-if="viewerCount > 1" class="flex items-center gap-2 text-muted" data-testid="event-viewers">
                <UIcon name="i-ph-eye" class="size-4 shrink-0" />
                <span>{{ t('events.detail.viewers', { count: viewerCount }) }}</span>
              </div>
            </ClientOnly>

            <div class="border-t border-default pt-3">
              <RsvpButtons :event="event" :my-rsvp="myRsvp" @updated="onRsvpUpdated" />
            </div>

            <ClientOnly>
              <UButton
                v-if="joinOpen && myRsvp === 'going'"
                :href="event.url!" external target="_blank"
                color="primary" size="lg" icon="i-ph-broadcast" block
                data-testid="event-join-live"
              >
                {{ t('events.detail.joinLive') }}
              </UButton>
            </ClientOnly>

            <UButton
              v-if="event.replayUrl"
              :href="event.replayUrl" external target="_blank"
              color="neutral" variant="soft" size="sm" icon="i-ph-play-circle" block
              data-testid="event-replay"
            >
              {{ t('events.detail.replay') }}
            </UButton>

            <div class="flex gap-2">
              <UButton
                color="neutral" variant="outline" size="sm" icon="i-ph-share-network" class="flex-1 justify-center"
                data-testid="event-share" @click="share"
              >
                {{ t('events.detail.share') }}
              </UButton>
              <UButton
                :href="`/api/events/${event.$id}/ics`" external
                color="neutral" variant="outline" size="sm" icon="i-ph-calendar-plus" class="flex-1 justify-center"
                data-testid="event-ics"
              >
                {{ t('events.detail.ics') }}
              </UButton>
            </div>
          </div>
        </div>
      </aside>

      <!-- Hauptspalte -->
      <div class="min-w-0">
        <h1 class="text-2xl font-bold" :class="{ 'line-through opacity-60': event.status === 'cancelled' }">
          {{ event.title }}
        </h1>
        <div v-if="event.organizerName" class="mt-2 flex items-center gap-2 text-sm text-muted">
          <UAvatar :src="initial.organizerAvatarUrl ?? undefined" :alt="event.organizerName" size="xs" />
          <span>{{ t('events.detail.organizer', { name: event.organizerName }) }}</span>
        </div>

        <div class="mt-4 flex items-center gap-3">
          <EventVoteButtons :event="event" :my-vote="myVote" @updated="onVoted" />
          <UDropdownMenu v-if="isLoggedIn" :items="reportItems">
            <UButton
              color="neutral" variant="ghost" size="xs" icon="i-ph-flag"
              :loading="reportBusy"
              data-testid="event-report"
            >
              {{ t('events.report.cta') }}
            </UButton>
          </UDropdownMenu>
        </div>

        <h2 class="mt-8 mb-2 font-semibold">{{ t('events.detail.details') }}</h2>
        <!-- Markdown (Listen, fett, …) ohne Raw-HTML; lange Texte geklappt -->
        <ContentClamp :lines="10" :text="event.description">
          <MarkdownContent :source="event.description" class="text-sm leading-relaxed" data-testid="event-description" />
        </ContentClamp>

        <div v-if="event.locationNotes && locationType === 'venue'" class="mt-6 rounded-lg bg-elevated/60 p-3 text-sm" data-testid="event-location-notes">
          <p class="mb-1 font-medium">{{ t('events.detail.findUs') }}</p>
          <p class="whitespace-pre-line text-muted">{{ event.locationNotes }}</p>
        </div>

        <h2 class="mt-8 mb-2 font-semibold" data-testid="event-attendees-title">
          {{ t('events.detail.attendeesTitle', { count: event.attendeeCount }) }}
        </h2>
        <div v-if="isLoggedIn && initial.attendees.length > 0" class="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="event-attendee-list">
          <div
            v-for="attendee in initial.attendees"
            :key="attendee.userId"
            class="flex items-center gap-2 rounded-lg border border-default p-2"
          >
            <UAvatar :src="attendee.avatarUrl ?? undefined" :alt="attendee.name" size="sm" />
            <span class="truncate text-sm">{{ attendee.name }}</span>
          </div>
        </div>
        <div v-else-if="!isLoggedIn && placeholderCount > 0" class="flex items-center gap-3" data-testid="event-attendees-blurred">
          <div class="flex -space-x-2" aria-hidden="true">
            <span v-for="i in placeholderCount" :key="i" class="size-8 rounded-full bg-accented blur-[3px] ring-2 ring-default" />
          </div>
          <UButton :to="localePath('/login')" color="neutral" variant="link" size="sm" class="px-0">
            {{ t('events.detail.loginToSee') }}
          </UButton>
        </div>
        <p v-else class="text-sm text-muted">{{ t('events.detail.noAttendees') }}</p>

        <div class="mt-10">
          <slot name="comments" :event="event" />
        </div>
      </div>
    </div>
  </article>
</template>
