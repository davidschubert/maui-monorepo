<script setup lang="ts">
import type { EventVoteResponse, EventWithRsvp } from '../../shared/types/event'
import { effectiveAccess, effectiveLocationType } from '../../shared/types/event'
import { detectLiveProvider } from '../../shared/liveProvider'

/**
 * Meetup-Muster (vertikal): Cover mit Preis-Badge oben, darunter Titel,
 * Datums-Spanne (mehrtägig sichtbar!), Veranstalter, Avatar-Reihe +
 * Teilnehmerzahl. Gäste sehen die ZAHL, aber nicht wer (Privacy-Gate:
 * die API liefert ihnen keine Avatare — hier rendern Platzhalter).
 */
const props = defineProps<{ event: EventWithRsvp }>()
const emit = defineEmits<{ updated: [event: EventWithRsvp] }>()

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const { formatDateSpan, formatMonthShort, isMultiDay } = useEventDateFormat()
const { coverUrl } = useEventCover()
const { isLoggedIn } = useCurrentUser()
const { formatCurrency } = useFormatCurrency()

/** Preis-Badge: paid mit Betrag, paid ohne Betrag, sonst „Kostenlos" */
const priceLabel = computed(() => {
  if (effectiveAccess(props.event) !== 'paid') return t('events.card.free')
  return props.event.priceAmount !== null
    ? formatCurrency(props.event.priceAmount / 100)
    : t('events.card.paid')
})

const day = computed(() => new Date(props.event.startAt).getDate())

const isFull = computed(() =>
  props.event.capacity !== null && props.event.attendeeCount >= props.event.capacity,
)
const spotsLeft = computed(() => {
  if (props.event.capacity === null) return null
  const left = props.event.capacity - props.event.attendeeCount
  return left > 0 && left <= 3 ? left : null
})

const online = computed(() => effectiveLocationType(props.event) === 'online')
const provider = computed(() => detectLiveProvider(props.event.url))

/** Gäste: generische Platzhalter in Höhe der (gedeckelten) Zusagerzahl */
const placeholderCount = computed(() => Math.min(props.event.attendeeCount, 3))

function onVoted(res: EventVoteResponse) {
  emit('updated', { ...props.event, ...res.event, myVote: res.myVote })
}

/** Teilen direkt von der Card (Muster EventDetail) */
async function share() {
  const url = `${window.location.origin}${localePath(`/events/${props.event.$id}`)}`
  try {
    if (navigator.share) {
      await navigator.share({ title: props.event.title, url })
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
</script>

<template>
  <NuxtLink
    :to="localePath(`/events/${event.$id}`)"
    class="flex h-full flex-col overflow-hidden rounded-xl border border-default transition-colors hover:bg-elevated/40"
    :data-event-card="event.$id"
  >
    <div class="relative">
      <img
        v-if="event.coverFileId"
        :src="coverUrl(event.coverFileId)"
        :alt="event.title"
        class="aspect-video w-full object-cover"
      >
      <div v-else class="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-elevated">
        <div class="flex h-14 w-14 flex-col items-center justify-center rounded-lg bg-default/80 text-center shadow-sm">
          <span class="text-lg leading-tight font-bold">{{ day }}</span>
          <span class="text-xs text-muted uppercase">{{ formatMonthShort(event.startAt) }}</span>
        </div>
      </div>

      <!-- Preis-Badge (Meetup-Muster): Kostenlos oder Ticket-Preis (E4) -->
      <UBadge color="neutral" variant="solid" size="sm" class="absolute top-2 left-2 bg-default/90 text-default" data-testid="card-price">
        {{ priceLabel }}
      </UBadge>

      <div class="absolute top-2 right-2 flex gap-1">
        <UBadge v-if="event.status === 'cancelled'" color="error" variant="solid" size="sm">
          {{ t('events.card.cancelled') }}
        </UBadge>
        <UBadge v-else-if="isFull" color="warning" variant="solid" size="sm">
          {{ t('events.card.full') }}
        </UBadge>
        <UBadge v-else-if="spotsLeft" color="warning" variant="solid" size="sm" data-testid="card-scarcity">
          {{ t('events.detail.spotsLeft', { count: spotsLeft }) }}
        </UBadge>
      </div>
    </div>

    <div class="flex flex-1 flex-col gap-1 p-3">
      <h3 class="font-semibold" :class="{ 'line-through opacity-60': event.status === 'cancelled' }">
        {{ event.title }}
      </h3>

      <p class="text-sm text-muted" data-testid="card-date">
        {{ formatDateSpan(event.startAt, event.endAt) }}
        <UBadge v-if="isMultiDay(event.startAt, event.endAt)" color="primary" variant="subtle" size="sm" class="ml-1" data-testid="card-multiday">
          {{ t('events.card.multiDay') }}
        </UBadge>
      </p>

      <p class="flex items-center gap-1 text-sm text-muted">
        <template v-if="online">
          <UIcon :name="provider.icon" class="size-4 shrink-0" />
          <span data-testid="card-online">{{ t('events.card.online') }}<template v-if="provider.label"> · {{ provider.label }}</template></span>
        </template>
        <template v-else>
          <UIcon name="i-ph-map-pin" class="size-4 shrink-0" />
          <span class="truncate" data-testid="card-venue">{{ event.location || t('events.card.inPerson') }}</span>
        </template>
      </p>

      <p class="text-xs text-muted">{{ t('events.card.by', { name: event.organizerName }) }}</p>

      <div class="mt-auto flex items-center justify-between gap-2 pt-2">
        <div class="flex items-center gap-2">
          <!-- Eingeloggt: echte Avatare · Gast: geblurte Platzhalter -->
          <UAvatarGroup v-if="isLoggedIn && event.attendeeAvatars.length > 0" size="2xs" :max="3">
            <UAvatar v-for="(url, i) in event.attendeeAvatars" :key="i" :src="url ?? undefined" :alt="t('events.detail.attendee')" />
          </UAvatarGroup>
          <div v-else-if="placeholderCount > 0" class="flex -space-x-1" data-testid="card-avatars-blurred" aria-hidden="true">
            <span v-for="i in placeholderCount" :key="i" class="size-5 rounded-full bg-accented blur-[2px] ring-1 ring-default" />
          </div>
          <span class="text-xs text-muted" data-testid="attendee-count">
            {{ t('events.card.attendees', { count: event.attendeeCount }) }}
          </span>
          <UBadge v-if="event.replayUrl" color="neutral" variant="subtle" size="sm" data-testid="card-replay">
            {{ t('events.card.replay') }}
          </UBadge>
          <UBadge v-if="event.myRsvp" :color="event.myRsvp === 'going' ? 'success' : 'neutral'" variant="subtle" size="sm">
            {{ t(`events.rsvp.status.${event.myRsvp}`) }}
          </UBadge>
        </div>

        <div class="flex items-center gap-0.5">
          <EventVoteButtons :event="event" :my-vote="event.myVote" @updated="onVoted" />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-ph-share-network"
            :aria-label="t('events.detail.share')"
            data-testid="card-share"
            @click.prevent.stop="share"
          />
        </div>
      </div>
    </div>
  </NuxtLink>
</template>
