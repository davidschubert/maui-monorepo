<script setup lang="ts">
import type { EventWithRsvp } from '../../shared/types/event'

/** Listen-Karte: Datum-Block links, Kern-Infos rechts, Status als Badges. */
const props = defineProps<{ event: EventWithRsvp }>()

const { t, locale, locales } = useI18n()
const localePath = useLocalePath()
const { formatTime } = useEventDateFormat()

const language = computed(() => {
  const entries = locales.value as Array<{ code: string, language?: string }>
  return entries.find(entry => entry.code === locale.value)?.language ?? locale.value
})

const start = computed(() => new Date(props.event.startAt))
const day = computed(() => new Intl.DateTimeFormat(language.value, { day: '2-digit' }).format(start.value))
const month = computed(() => new Intl.DateTimeFormat(language.value, { month: 'short' }).format(start.value))

const isFull = computed(() =>
  props.event.capacity !== null && props.event.attendeeCount >= props.event.capacity,
)
</script>

<template>
  <NuxtLink
    :to="localePath(`/events/${event.$id}`)"
    class="flex gap-4 rounded-lg border border-default p-4 transition-colors hover:bg-elevated/50"
    :data-event-card="event.$id"
  >
    <div class="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-elevated text-center">
      <span class="text-lg leading-tight font-bold">{{ day }}</span>
      <span class="text-xs text-muted uppercase">{{ month }}</span>
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
        <UBadge v-if="event.myRsvp" :color="event.myRsvp === 'going' ? 'success' : 'neutral'" variant="subtle" size="sm">
          {{ t(`events.rsvp.status.${event.myRsvp}`) }}
        </UBadge>
      </div>

      <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span class="inline-flex items-center gap-1">
          <UIcon name="i-ph-clock" class="size-4" />
          {{ formatTime(event.startAt) }}
        </span>
        <span v-if="event.location" class="inline-flex min-w-0 items-center gap-1">
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
