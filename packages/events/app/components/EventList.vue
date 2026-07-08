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

// Suche: debounct gegen ?q (Fulltext auf title, Migration 003)
const search = ref('')
const debouncedSearch = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { debouncedSearch.value = value.trim() }, 300)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

const listQuery = computed(() => ({
  ...(past.value ? { past: 'true' } : {}),
  ...(debouncedSearch.value ? { q: debouncedSearch.value } : {}),
}))

const { data, status } = await useAsyncData<EventListResponse>(
  'events:list',
  () => $fetch('/api/events', { query: listQuery.value }),
  { watch: [past, debouncedSearch] },
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
      query: { ...listQuery.value, cursor: nextCursor.value },
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

/** Vote-Updates aus der Card in die Liste übernehmen */
function onCardUpdated(updated: EventWithRsvp) {
  rows.value = rows.value.map(row => (row.$id === updated.$id ? updated : row))
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

    <UInput
      v-model="search"
      icon="i-ph-magnifying-glass"
      :placeholder="t('events.list.searchPlaceholder')"
      class="mt-3 w-full"
      data-testid="events-search"
    />

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
        {{ debouncedSearch ? t('events.list.searchEmpty') : past ? t('events.list.pastEmpty') : t('events.list.empty') }}
      </p>

      <div v-else class="mt-4 space-y-6" data-testid="events-list">
        <section v-for="group in groups" :key="group.label">
          <h2 class="mb-2 text-sm font-semibold text-muted capitalize" data-testid="events-month">{{ group.label }}</h2>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <EventCard v-for="event in group.events" :key="event.$id" :event="event" @updated="onCardUpdated" />
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
