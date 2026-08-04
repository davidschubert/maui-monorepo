<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { canHideEvent, canRedactEvent, canRestoreEvent, eventIsRedacted } from '../../../shared/eventModerationPolicy'
import type { EventModerationResponse, EventRow } from '../../../shared/types/event'

/**
 * Moderations-Queue für Termine (F15, 2026-08-03).
 *
 * WARUM EINE EIGENE SEITE und kein Abschnitt in `/dashboard/events`: diese Seite
 * verlangt `events.moderate`, `/dashboard/events` verlangt `events.manage` — und
 * die beiden Rollen enthalten sich NICHT (communityAuthz.ts: Editor und Moderator
 * sind Geschwister). Ein Moderator hat `events.manage` nicht und käme auf die
 * Redaktions-Seite gar nicht erst drauf; der Abschnitt wäre für genau die Rolle
 * unerreichbar, für die er gebaut ist — die „tote Capability" aus Audit-Befund S9.
 * posts hat dieselbe Trennung aus demselben Grund (`/dashboard/posts` moderiert,
 * `/dashboard/my-posts` verfasst — C16 in `posts/app/app.config.ts`).
 *
 * Datenliste als `UTable` (Davids Entscheidung B6), leerer Zustand über
 * `CoreEmptyState`.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'events.moderate' })

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const { formatDateTime } = useEventDateFormat()
const { formatRelativeTime } = useFormatRelativeTime()

useHead({ title: () => t('events.moderation.title') })

const { data, status, refresh } = await useFetch<EventModerationResponse>('/api/events/moderation', {
  lazy: true,
  server: false,
})

/**
 * Filter im Toolbar-Muster der anderen Queues. „Gemeldet" ist bewusst der
 * INTERESSANTE Filter und nicht die Voreinstellung: die Liste zeigt den Kontext,
 * in dem geurteilt wird (moderation.get.ts), nicht nur die Beschwerden.
 */
type StateFilter = 'all' | 'reported' | 'hidden'
const STATE_FILTERS: StateFilter[] = ['all', 'reported', 'hidden']
const STATE_ICON: Record<StateFilter, string> = {
  all: 'i-ph-list-bullets',
  reported: 'i-ph-flag',
  hidden: 'i-ph-eye-slash',
}
const stateFilter = ref<StateFilter>('all')
const filterLinks = computed(() => STATE_FILTERS.map(value => ({
  label: t(`events.moderation.filter.${value}`),
  icon: STATE_ICON[value],
  active: stateFilter.value === value,
  onSelect: () => { stateFilter.value = value },
})))

const reportCount = (row: EventRow) => data.value?.reportCounts[row.$id] ?? 0

const visible = computed(() => (data.value?.rows ?? []).filter((row) => {
  if (stateFilter.value === 'reported') return reportCount(row) > 0
  if (stateFilter.value === 'hidden') return row.status === 'hidden'
  return true
}))

const busyId = ref('')
async function setHidden(row: EventRow, hide: boolean) {
  busyId.value = row.$id
  try {
    await $fetch(`/api/events/${row.$id}/${hide ? 'hide' : 'restore'}` as string, { method: 'POST' })
    // Beim Ausblenden passiert MEHR, als der Titel sagt: die Route schließt
    // zugleich die offenen Meldungen und nimmt den Termin aus dem Activity-Feed
    // (hide.post.ts). Wiederherstellen erklärt sich dagegen selbst.
    toast.add({
      title: t(hide ? 'events.moderation.hidden' : 'events.moderation.restored'),
      description: hide ? t('events.moderation.hiddenHint') : undefined,
      color: 'success',
    })
    await refresh()
  }
  catch {
    toast.add({ title: t('events.moderation.actionFailed'), description: t('events.moderation.actionFailedHint'), color: 'error' })
  }
  finally {
    busyId.value = ''
  }
}

/**
 * Schwärzen (F46) — die eine Aktion für einen ABGESAGTEN Termin.
 *
 * MIT RÜCKFRAGE, anders als Ausblenden und Wiederherstellen: die beiden sind
 * umkehrbar, diese hier nicht. Der Originaltext ist danach weg, und es gibt
 * bewusst keine Kopie davon (redact.post.ts) — die Sicherung gehört deshalb VOR
 * die Tat. Muster: `confirm()` wie beim Absagen in /dashboard/events.
 */
async function redactEvent(row: EventRow) {
  try {
    const ok = await confirm({
      title: t('events.moderation.confirmRedactTitle'),
      description: t('events.moderation.confirmRedactText', { title: row.title }),
      confirmLabel: t('events.moderation.redactConfirm'),
      action: () => $fetch(`/api/events/${row.$id}/redact` as string, { method: 'POST' }),
    })
    if (!ok) return
    toast.add({
      title: t('events.moderation.redacted'),
      description: t('events.moderation.redactedHint'),
      color: 'success',
    })
    await refresh()
  }
  catch {
    toast.add({ title: t('events.moderation.actionFailed'), description: t('events.moderation.actionFailedHint'), color: 'error' })
  }
}

const statusColor = (row: EventRow) =>
  row.status === 'published' ? 'success' : row.status === 'cancelled' ? 'error' : 'warning'

// Ort und Datum sind Kontext — auf schmalen Schirmen fallen sie weg.
const HIDE_SM = { td: 'hidden sm:table-cell', th: 'hidden sm:table-cell' }
const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }

const columns = computed<TableColumn<EventRow>[]>(() => [
  { id: 'event', header: () => t('events.moderation.col.event') },
  { accessorKey: 'organizerName', header: () => t('events.moderation.col.organizer'), meta: { class: HIDE_SM } },
  { accessorKey: 'startAt', header: () => t('events.moderation.col.start'), id: 'start', meta: { class: HIDE_MD } },
  { id: 'state', header: () => t('events.moderation.col.state') },
  { id: 'actions', header: () => '' },
])

/**
 * Zeilen-Aktionen. Die Bedingungen kommen aus derselben puren Regel, die auch
 * die Routen durchsetzen (`eventModerationPolicy.ts`) — so bietet die Oberfläche
 * keinen Knopf an, der in ein 409 läuft.
 *
 * JE ZUSTAND GENAU EIN WERKZEUG (F46): veröffentlicht ⇒ ausblenden ·
 * ausgeblendet ⇒ wieder anzeigen · abgesagt ⇒ schwärzen. Ein abgesagter Termin
 * wird bewusst NICHT ausgeblendet — die Zusagenden müssen die Absage sehen —,
 * sein TEXT lässt sich aber seit F46 entfernen.
 *
 * IST SCHON GESCHWÄRZT, bleibt nur der Hinweis: die Route nähme den zweiten
 * Aufruf zwar idempotent an, aber ein Knopf, der nichts mehr bewirkt, ist eine
 * Einladung zum Zweifeln, ob der erste Klick gewirkt hat.
 */
function rowActions(row: EventRow): DropdownMenuItem[][] {
  if (canRestoreEvent(row.status).allowed) {
    return [[{ label: t('events.moderation.restore'), icon: 'i-ph-eye', color: 'success', onSelect: () => { void setHidden(row, false) } }]]
  }
  if (canHideEvent(row.status).allowed) {
    return [[{ label: t('events.moderation.hide'), icon: 'i-ph-eye-slash', color: 'error', onSelect: () => { void setHidden(row, true) } }]]
  }
  if (canRedactEvent(row.status).allowed && !eventIsRedacted(row.redactedAt)) {
    return [[{ label: t('events.moderation.redact'), icon: 'i-ph-eraser', color: 'error', onSelect: () => { void redactEvent(row) } }]]
  }
  return [[{ label: t('events.moderation.noAction'), icon: 'i-ph-info', disabled: true }]]
}
</script>

<template>
  <UDashboardPanel id="events-moderation">
    <template #header>
      <UDashboardNavbar :title="t('events.moderation.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="filterLinks" highlight class="-mx-1 flex-1" data-events-mod-filter />
      </UDashboardToolbar>
    </template>

    <template #body>
      <ClientOnly>
        <template #fallback>
          <div class="flex justify-center py-16"><UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" /></div>
        </template>

        <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
          <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
        </div>

        <UTable v-else :data="visible" :columns="columns" data-events-mod-table>
          <template #event-cell="{ row }">
            <div class="max-w-md min-w-0" :data-mod-event="row.original.$id">
              <!-- Geschwärzt (F46): der Titel ist LEER, und leer allein sagt
                   nicht, ob nie etwas dastand oder ob jemand es entfernt hat.
                   Der Platzhalter kommt aus i18n, nie aus der Zeile. -->
              <p
                v-if="eventIsRedacted(row.original.redactedAt)"
                class="truncate text-muted italic"
                data-mod-redacted-title
              >
                {{ t('events.redacted.title') }}
              </p>
              <p v-else class="truncate font-medium" :title="row.original.title">{{ row.original.title }}</p>
              <p v-if="row.original.location" class="truncate text-sm text-muted">{{ row.original.location }}</p>
            </div>
          </template>
          <template #organizerName-cell="{ row }">
            <span class="text-sm text-muted">{{ row.original.organizerName }}</span>
          </template>
          <template #start-cell="{ row }">
            <span class="whitespace-nowrap text-sm text-muted">{{ formatDateTime(row.original.startAt) }}</span>
          </template>
          <template #state-cell="{ row }">
            <div class="flex flex-wrap items-center gap-1">
              <UBadge v-if="reportCount(row.original)" color="warning" variant="subtle" size="sm" data-mod-reported>
                {{ t('events.moderation.reports', { count: reportCount(row.original) }) }}
              </UBadge>
              <UBadge :color="statusColor(row.original)" variant="subtle" size="sm">
                {{ t(`events.admin.status.${row.original.status}`) }}
              </UBadge>
              <!-- Neben dem Status, nicht statt seiner: „abgesagt" und
                   „geschwärzt" sind zwei Aussagen, und beide bleiben wahr. -->
              <UBadge
                v-if="eventIsRedacted(row.original.redactedAt)"
                color="neutral"
                variant="subtle"
                size="sm"
                icon="i-ph-eraser"
                data-mod-redacted
              >
                {{ t('events.redacted.badge') }}
              </UBadge>
              <span class="whitespace-nowrap text-xs text-dimmed">{{ formatRelativeTime(row.original.$createdAt) }}</span>
            </div>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
                <UButton
                  icon="i-ph-dots-three-vertical"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="t('events.moderation.rowActions')"
                  :loading="busyId === row.original.$id"
                  :data-mod-toggle="row.original.$id"
                />
              </UDropdownMenu>
            </div>
          </template>

          <template #empty>
            <CoreEmptyState
              v-if="stateFilter !== 'all'"
              icon="i-ph-funnel"
              :title="t('ui.empty.noResultsTitle')"
              :description="t('ui.empty.noResultsText')"
              :action-label="t('ui.empty.resetFilters')"
              action-icon="i-ph-arrow-counter-clockwise"
              @action="() => { stateFilter = 'all' }"
            />
            <CoreEmptyState
              v-else
              icon="i-ph-calendar-check"
              :title="t('events.moderation.emptyTitle')"
              :description="t('events.moderation.empty')"
            />
          </template>
        </UTable>
      </ClientOnly>
    </template>
  </UDashboardPanel>
</template>
