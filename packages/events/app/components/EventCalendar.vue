<script setup lang="ts">
import type { EventListResponse, EventWithRsvp } from '../../shared/types/event'

/**
 * Monats-Kalender (EVENTS-V2 §2): schlichtes Grid, published only.
 * Mehrtägige Events = eine Pill an JEDEM Tag im Fenster — bewusst keine
 * absolut positionierten Balken (Einfachheit als Leitprinzip). Daten pro
 * Monat über die Range-Query (?from&to), client-seitig geladen.
 * `highlightId` (Card-Hover in der Liste) hebt die Pills des Events hervor;
 * umgekehrt meldet Pill-Hover das Event nach oben (`hover`-Emit) — die
 * Liste highlightet dann die Card.
 */
const props = defineProps<{ highlightId?: string | null }>()

const emit = defineEmits<{ hover: [eventId: string | null] }>()

const { t, locale, locales } = useI18n()
const localePath = useLocalePath()

const language = computed(() => {
  const entries = locales.value as Array<{ code: string, language?: string }>
  return entries.find(entry => entry.code === locale.value)?.language ?? locale.value
})

/** Erster Tag des angezeigten Monats (lokale Zeit) */
const month = ref(startOfMonth(new Date()))
const rows = ref<EventWithRsvp[]>([])
const pending = ref(false)

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

const monthLabel = computed(() =>
  new Intl.DateTimeFormat(language.value, { month: 'long', year: 'numeric' }).format(month.value),
)

/** Mo-basierte Wochentags-Header (Intl, locale-korrekt) */
const weekdays = computed(() => {
  const fmt = new Intl.DateTimeFormat(language.value, { weekday: 'short' })
  // 2026-06-01 ist ein Montag — 7 aufeinanderfolgende Tage ab Montag
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 5, 1 + i)))
})

interface CalendarDay {
  key: string
  day: number
  inMonth: boolean
  isToday: boolean
  events: EventWithRsvp[]
}

/** Kalendertag-Schlüssel in LOKALER Zeit (Datumsgrenzen = Nutzer-Sicht) */
function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const days = computed<CalendarDay[]>(() => {
  const first = month.value
  // Grid beginnt am Montag der ersten Woche
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - ((first.getDay() + 6) % 7))

  // Events je Tag: mehrtägig ⇒ jeder Tag zwischen startAt und endAt
  const byDay = new Map<string, EventWithRsvp[]>()
  for (const ev of rows.value) {
    const start = new Date(ev.startAt)
    const end = ev.endAt ? new Date(ev.endAt) : start
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    for (let i = 0; i < 62 && cursor.getTime() <= end.getTime(); i++) {
      const key = dayKey(cursor)
      byDay.set(key, [...(byDay.get(key) ?? []), ev])
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  const todayKey = dayKey(new Date())
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + i)
    const key = dayKey(date)
    return {
      key,
      day: date.getDate(),
      inMonth: date.getMonth() === first.getMonth(),
      isToday: key === todayKey,
      events: byDay.get(key) ?? [],
    }
  })
})

async function load() {
  pending.value = true
  try {
    const from = new Date(month.value)
    from.setDate(from.getDate() - 7)
    const to = new Date(month.value.getFullYear(), month.value.getMonth() + 1, 7)
    const res = await $fetch<EventListResponse>('/api/events', {
      query: { from: from.toISOString(), to: to.toISOString() },
    })
    rows.value = res.rows
  }
  catch {
    rows.value = []
  }
  finally {
    pending.value = false
  }
}

function shift(delta: number) {
  month.value = new Date(month.value.getFullYear(), month.value.getMonth() + delta, 1)
}

watch(month, load, { immediate: true })
</script>

<template>
  <div data-testid="events-calendar">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="font-semibold capitalize">{{ monthLabel }}</h2>
      <div class="flex items-center gap-1">
        <UButton
          color="neutral" variant="ghost" size="xs" icon="i-ph-caret-left"
          :aria-label="t('events.calendar.prev')" data-testid="calendar-prev" @click="shift(-1)"
        />
        <UButton
          color="neutral" variant="ghost" size="xs"
          data-testid="calendar-today" @click="() => { month = startOfMonth(new Date()) }"
        >
          {{ t('events.calendar.today') }}
        </UButton>
        <UButton
          color="neutral" variant="ghost" size="xs" icon="i-ph-caret-right"
          :aria-label="t('events.calendar.next')" data-testid="calendar-next" @click="shift(1)"
        />
      </div>
    </div>

    <div class="grid grid-cols-7 text-center text-xs font-medium text-muted">
      <span v-for="weekday in weekdays" :key="weekday" class="py-1">{{ weekday }}</span>
    </div>

    <div class="grid grid-cols-7 overflow-hidden rounded-lg border border-default" :class="{ 'opacity-60': pending }">
      <div
        v-for="cell in days"
        :key="cell.key"
        class="min-h-16 border-t border-r border-default p-1 [&:nth-child(-n+7)]:border-t-0 [&:nth-child(7n)]:border-r-0"
        :class="cell.inMonth ? '' : 'bg-elevated/40'"
        :data-calendar-day="cell.key"
      >
        <span
          class="inline-flex size-5 items-center justify-center rounded-full text-xs"
          :class="cell.isToday ? 'bg-primary font-semibold text-inverted' : cell.inMonth ? '' : 'text-dimmed'"
        >
          {{ cell.day }}
        </span>
        <div class="mt-0.5 space-y-0.5">
          <NuxtLink
            v-for="ev in cell.events.slice(0, 3)"
            :key="`${cell.key}:${ev.$id}`"
            :to="localePath(`/events/${ev.$id}`)"
            class="block truncate rounded px-1 text-xs leading-5 transition-colors"
            :class="[
              props.highlightId === ev.$id
                ? 'bg-primary font-medium text-inverted ring-2 ring-primary/60'
                : 'bg-primary/15 text-primary hover:bg-primary/25',
              { 'line-through opacity-60': ev.status === 'cancelled' },
            ]"
            :data-calendar-event="ev.$id"
            :data-calendar-highlighted="props.highlightId === ev.$id || undefined"
            @mouseenter="emit('hover', ev.$id)"
            @mouseleave="emit('hover', null)"
          >
            {{ ev.title }}
          </NuxtLink>
          <span v-if="cell.events.length > 3" class="block px-1 text-[10px] text-muted">
            +{{ cell.events.length - 3 }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
