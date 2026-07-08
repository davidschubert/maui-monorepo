<script setup lang="ts">
import type { EventListResponse, EventWithRsvp } from '../../shared/types/event'

/**
 * Event-Übersicht: Filter-Chips (Kommende/Heute/Morgen/Wochenende/Archiv +
 * eingeloggt: Zugesagt/Geliked/Teilgenommen — Letzteres ist der Unterschied
 * zum Archiv: nur MEINE besuchten Events) + Listen-/Kalender-Ansicht.
 * Liste ist Default (SSR, erste Seite ohne Flash) mit Monats-Gruppierung und
 * Cursor-Pagination (nur Kommende/Archiv); Kalender ist die zweite Ansicht.
 * Zeitfenster (Heute/Morgen/Wochenende) rechnet der CLIENT in lokaler Zeit
 * und nutzt die Range-Query — Chip-Klicks sind ohnehin client-seitig.
 */
const { t, locale, locales } = useI18n()
const { isLoggedIn } = useCurrentUser()

type EventFilter = 'upcoming' | 'today' | 'tomorrow' | 'weekend' | 'archive' | 'going' | 'liked' | 'attended'
const filter = ref<EventFilter>('upcoming')
const view = ref<'list' | 'calendar'>('list')
const rows = ref<EventWithRsvp[]>([])
const nextCursor = ref<string | null>(null)
const loadingMore = ref(false)

const TIME_FILTERS: EventFilter[] = ['upcoming', 'today', 'tomorrow', 'weekend', 'archive']
const MINE_FILTERS: EventFilter[] = ['going', 'liked', 'attended']

/** lokaler Kalendertag (+offset) als [from, to)-Fenster */
function dayRange(offsetDays: number): { from: string, to: string } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() + offsetDays)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

/** kommendes Wochenende (Sa+So) — am Sonntag zählt der Rest-Sonntag */
function weekendRange(): { from: string, to: string } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const day = start.getDay()
  if (day === 0) {
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { from: start.toISOString(), to: end.toISOString() }
  }
  start.setDate(start.getDate() + (6 - day))
  const end = new Date(start)
  end.setDate(end.getDate() + 2)
  return { from: start.toISOString(), to: end.toISOString() }
}

// Suche: debounct gegen ?q (Fulltext auf title, Migration 003)
const search = ref('')
const debouncedSearch = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { debouncedSearch.value = value.trim() }, 300)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

const listQuery = computed<Record<string, string>>(() => {
  const base: Record<string, string> = debouncedSearch.value ? { q: debouncedSearch.value } : {}
  switch (filter.value) {
    case 'archive': return { ...base, past: 'true' }
    case 'today': return { ...base, ...dayRange(0) }
    case 'tomorrow': return { ...base, ...dayRange(1) }
    case 'weekend': return { ...base, ...weekendRange() }
    case 'going':
    case 'liked':
    case 'attended': return { ...base, mine: filter.value }
    default: return base
  }
})

const { data, status } = await useAsyncData<EventListResponse>(
  'events:list',
  () => $fetch('/api/events', { query: listQuery.value }),
  { watch: [filter, debouncedSearch] },
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
    <div class="flex items-start justify-between gap-2">
      <div class="flex flex-wrap items-center gap-1" role="tablist" data-testid="events-filters">
        <UButton
          v-for="item in TIME_FILTERS"
          :key="item"
          :color="filter === item ? 'primary' : 'neutral'"
          :variant="filter === item ? 'soft' : 'ghost'"
          size="sm"
          :data-filter="item"
          @click="filter = item"
        >
          {{ t(`events.list.filters.${item}`) }}
        </UButton>
        <template v-if="isLoggedIn">
          <span class="mx-1 h-4 w-px bg-accented" aria-hidden="true" />
          <UButton
            v-for="item in MINE_FILTERS"
            :key="item"
            :color="filter === item ? 'primary' : 'neutral'"
            :variant="filter === item ? 'soft' : 'ghost'"
            size="sm"
            :data-filter="item"
            @click="filter = item"
          >
            {{ t(`events.list.filters.${item}`) }}
          </UButton>
        </template>
      </div>

      <div class="flex shrink-0 gap-1">
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
        {{ debouncedSearch
          ? t('events.list.searchEmpty')
          : filter === 'archive' ? t('events.list.pastEmpty')
            : filter === 'upcoming' ? t('events.list.empty') : t('events.list.filterEmpty') }}
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
