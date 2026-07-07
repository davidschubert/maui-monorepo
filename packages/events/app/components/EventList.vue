<script setup lang="ts">
import type { EventListResponse, EventWithRsvp } from '../../shared/types/event'

/**
 * Event-Liste mit Umschalter Kommende/Archiv und Cursor-Pagination
 * („Mehr laden"). Erste Seite kommt per SSR mit — kein Content-Flash.
 */
const { t } = useI18n()

const past = ref(false)
const rows = ref<EventWithRsvp[]>([])
const nextCursor = ref<string | null>(null)
const loadingMore = ref(false)

const { data, status } = await useAsyncData<EventListResponse>(
  'events:list',
  () => $fetch('/api/events', { query: past.value ? { past: 'true' } : {} }),
  { watch: [past] },
)

watch(data, (value) => {
  rows.value = value?.rows ?? []
  nextCursor.value = value?.nextCursor ?? null
}, { immediate: true })

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const res = await $fetch<EventListResponse>('/api/events', {
      query: { ...(past.value ? { past: 'true' } : {}), cursor: nextCursor.value },
    })
    rows.value = [...rows.value, ...res.rows]
    nextCursor.value = res.nextCursor
  }
  catch {
    // nächster Klick versucht es erneut
  }
  finally {
    loadingMore.value = false
  }
}
</script>

<template>
  <div>
    <div class="flex gap-1" role="tablist">
      <UButton
        :color="past ? 'neutral' : 'primary'"
        :variant="past ? 'ghost' : 'soft'"
        size="sm"
        data-testid="events-upcoming"
        @click="past = false"
      >
        {{ t('events.list.upcoming') }}
      </UButton>
      <UButton
        :color="past ? 'primary' : 'neutral'"
        :variant="past ? 'soft' : 'ghost'"
        size="sm"
        data-testid="events-past"
        @click="past = true"
      >
        {{ t('events.list.past') }}
      </UButton>
    </div>

    <div v-if="status === 'pending' && rows.length === 0" class="flex justify-center py-16">
      <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
    </div>

    <p v-else-if="rows.length === 0" class="py-16 text-center text-sm text-muted" data-testid="events-empty">
      {{ past ? t('events.list.pastEmpty') : t('events.list.empty') }}
    </p>

    <div v-else class="mt-4 space-y-3" data-testid="events-list">
      <EventCard v-for="event in rows" :key="event.$id" :event="event" />
    </div>

    <div v-if="nextCursor" class="mt-4 flex justify-center">
      <UButton color="neutral" variant="outline" size="sm" :loading="loadingMore" @click="loadMore">
        {{ t('events.list.loadMore') }}
      </UButton>
    </div>
  </div>
</template>
