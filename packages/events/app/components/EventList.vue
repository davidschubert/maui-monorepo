<script setup lang="ts">
import type { EventListResponse, EventWithRsvp } from '../../shared/types/event'

/**
 * Event-Übersicht: Umschalter Kommende/Archiv + Listen-/Kalender-Ansicht.
 * Liste ist Default (SSR, erste Seite ohne Flash) mit Monats-Gruppierung und
 * Cursor-Pagination; Kalender ist die zweite Ansicht (client-geladen).
 */
const { t, locale, locales } = useI18n()

const past = ref(false)
const view = ref<'list' | 'calendar'>('list')
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

// Monats-Gruppierung (Referenz S1): Überschrift je Monat, locale-korrekt
const language = computed(() => {
  const entries = locales.value as Array<{ code: string, language?: string }>
  return entries.find(entry => entry.code === locale.value)?.language ?? locale.value
})
const groups = computed(() => {
  const fmt = new Intl.DateTimeFormat(language.value, { month: 'long', year: 'numeric' })
  const out: Array<{ label: string, events: EventWithRsvp[] }> = []
  for (const ev of rows.value) {
    const label = fmt.format(new Date(ev.startAt))
    const last = out.at(-1)
    if (last && last.label === label) last.events.push(ev)
    else out.push({ label, events: [ev] })
  }
  return out
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-2">
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

      <div class="flex gap-1">
        <UButton
          :color="view === 'list' ? 'primary' : 'neutral'"
          :variant="view === 'list' ? 'soft' : 'ghost'"
          size="sm" icon="i-ph-list-bullets"
          :aria-label="t('events.list.viewList')"
          data-testid="events-view-list"
          @click="view = 'list'"
        />
        <UButton
          :color="view === 'calendar' ? 'primary' : 'neutral'"
          :variant="view === 'calendar' ? 'soft' : 'ghost'"
          size="sm" icon="i-ph-calendar-blank"
          :aria-label="t('events.list.viewCalendar')"
          data-testid="events-view-calendar"
          @click="view = 'calendar'"
        />
      </div>
    </div>

    <ClientOnly v-if="view === 'calendar'">
      <EventCalendar class="mt-4" />
      <template #fallback>
        <div class="flex justify-center py-16"><UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" /></div>
      </template>
    </ClientOnly>

    <template v-else>
      <div v-if="status === 'pending' && rows.length === 0" class="flex justify-center py-16">
        <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
      </div>

      <p v-else-if="rows.length === 0" class="py-16 text-center text-sm text-muted" data-testid="events-empty">
        {{ past ? t('events.list.pastEmpty') : t('events.list.empty') }}
      </p>

      <div v-else class="mt-4 space-y-6" data-testid="events-list">
        <section v-for="group in groups" :key="group.label">
          <h2 class="mb-2 text-sm font-semibold text-muted capitalize" data-testid="events-month">{{ group.label }}</h2>
          <div class="space-y-3">
            <EventCard v-for="event in group.events" :key="event.$id" :event="event" />
          </div>
        </section>
      </div>

      <div v-if="nextCursor" class="mt-4 flex justify-center">
        <UButton color="neutral" variant="outline" size="sm" :loading="loadingMore" @click="loadMore">
          {{ t('events.list.loadMore') }}
        </UButton>
      </div>
    </template>
  </div>
</template>
