<script setup lang="ts">
import type { EventWithRsvp } from '../../shared/types/event'
import { effectiveLocationType } from '../../shared/types/event'
import { detectLiveProvider } from '../../shared/liveProvider'

/**
 * Listen-Karte: Cover-Thumbnail (oder Datum-Block), Kern-Infos, Status als
 * Badges (abgesagt/ausgebucht/knapp/Replay), eigener RSVP-Status.
 */
const props = defineProps<{ event: EventWithRsvp }>()

const { t } = useI18n()
const localePath = useLocalePath()
const { formatTime, formatMonthShort } = useEventDateFormat()
const { coverUrl } = useEventCover()

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
</script>

<template>
  <NuxtLink
    :to="localePath(`/events/${event.$id}`)"
    class="flex gap-4 rounded-lg border border-default p-4 transition-colors hover:bg-elevated/50"
    :data-event-card="event.$id"
  >
    <img
      v-if="event.coverFileId"
      :src="coverUrl(event.coverFileId)"
      :alt="event.title"
      class="h-14 w-24 shrink-0 rounded-lg object-cover"
    >
    <div v-else class="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-elevated text-center">
      <span class="text-lg leading-tight font-bold">{{ day }}</span>
      <span class="text-xs text-muted uppercase">{{ formatMonthShort(event.startAt) }}</span>
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="truncate font-semibold" :class="{ 'line-through opacity-60': event.status === 'cancelled' }">
          {{ event.title }}
        </h3>
        <UBadge v-if="event.status === 'cancelled'" color="error" variant="subtle" size="sm">
          {{ t('events.card.cancelled') }}
        </UBadge>
        <UBadge v-else-if="isFull" color="warning" variant="subtle" size="sm">
          {{ t('events.card.full') }}
        </UBadge>
        <UBadge v-else-if="spotsLeft" color="warning" variant="subtle" size="sm" data-testid="card-scarcity">
          {{ t('events.detail.spotsLeft', { count: spotsLeft }) }}
        </UBadge>
        <UBadge v-if="event.replayUrl" color="neutral" variant="subtle" size="sm" data-testid="card-replay">
          <UIcon name="i-ph-play-circle" class="size-3" /> {{ t('events.card.replay') }}
        </UBadge>
        <UBadge v-if="event.myRsvp" :color="event.myRsvp === 'going' ? 'success' : 'neutral'" variant="subtle" size="sm">
          {{ t(`events.rsvp.status.${event.myRsvp}`) }}
        </UBadge>
      </div>

      <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span class="inline-flex items-center gap-1">
          <UIcon name="i-ph-clock" class="size-4" />
          {{ formatTime(event.startAt) }}
        </span>
        <span v-if="online" class="inline-flex items-center gap-1" data-testid="card-online">
          <UIcon :name="provider.icon" class="size-4" />
          {{ provider.label || t('events.detail.online') }}
        </span>
        <span v-else-if="event.location" class="inline-flex min-w-0 items-center gap-1">
          <UIcon name="i-ph-map-pin" class="size-4 shrink-0" />
          <span class="truncate">{{ event.location }}</span>
        </span>
        <span class="inline-flex items-center gap-1" data-testid="attendee-count">
          <UIcon name="i-ph-users" class="size-4" />
          {{ event.capacity !== null
            ? t('events.card.attendeesOfCapacity', { count: event.attendeeCount, capacity: event.capacity })
            : t('events.card.attendees', { count: event.attendeeCount }) }}
        </span>
      </p>
    </div>
  </NuxtLink>
</template>
