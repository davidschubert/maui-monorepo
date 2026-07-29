<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { FeedbackListResponse, FeedbackRow } from '../../../shared/types/feedback'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'feedback.manage' })

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const { formatRelativeTime } = useFormatRelativeTime()
const { page, setPage } = usePagination()
const appConfig = useAppConfig()
const auth = useAuthStore()
const localePath = useLocalePath()

useHead({ title: () => t('feedback.admin.title') })

// Filter-Tabs im Toolbar-Muster der Kommentar-Moderation (Offen/Erledigt —
// „Alle" bewusst weggelassen, die Mischung beider Zustände hilft beim
// Sichten nicht)
type FeedbackFilter = 'open' | 'resolved'
const FILTERS: FeedbackFilter[] = ['open', 'resolved']
const FILTER_ICON: Record<FeedbackFilter, string> = {
  open: 'i-ph-tray',
  resolved: 'i-ph-check-circle',
}
const filter = ref<FeedbackFilter>('open')
watch(filter, () => setPage(1))

const filterLinks = computed(() => FILTERS.map(value => ({
  label: t(`feedback.admin.filter.${value}`),
  icon: FILTER_ICON[value],
  active: filter.value === value,
  onSelect: () => { filter.value = value },
})))

// Suche über den Fulltext-Index auf feedback.message (Migration 002) —
// erst auf Absenden, damit nicht jeder Tastendruck eine Abfrage auslöst.
const search = ref('')
const activeSearch = ref('')
const { sortField, sortDir, toggle } = useTableSort('$createdAt', 'desc')

function runSearch() {
  activeSearch.value = search.value.trim()
  setPage(1)
}

const { data, status: fetchStatus, refresh } = await useFetch<FeedbackListResponse>('/api/feedback', {
  query: computed(() => ({
    status: filter.value,
    page: page.value,
    search: activeSearch.value,
    dir: sortDir.value,
  })),
  lazy: true,
  server: false,
})

watch(sortDir, () => setPage(1))

// „Filter/Suche ohne Treffer" ist ein eigener Leerzustand — hier ist der eine
// nächste Schritt das Zurücksetzen, nicht das Anlegen.
const hasActiveFilter = computed(() => activeSearch.value !== '' || filter.value !== 'open')
function resetFilters() {
  search.value = ''
  activeSearch.value = ''
  filter.value = 'open'
}

const CATEGORY_ICON: Record<string, string> = {
  idea: 'i-ph-lightbulb',
  bug: 'i-ph-bug',
  other: 'i-ph-chat-circle-dots',
}

const busyId = ref('')
async function setDone(row: FeedbackRow, done: boolean) {
  busyId.value = row.$id
  try {
    await $fetch(`/api/feedback/${row.$id}`, { method: 'PATCH', body: { status: done ? 'resolved' : 'open' } })
    await refresh()
  }
  catch {
    toast.add({ title: t('feedback.admin.actionFailed'), color: 'error' })
  }
  finally {
    busyId.value = ''
  }
}

// Feedback → Ticket (A14: die App setzt maui.feedback.ticketEndpoint und
// verdrahtet dahinter ihren Board-Layer; ohne Endpoint kein Button)
const ticketEndpoint = computed(() =>
  (appConfig.maui as { feedback?: { ticketEndpoint?: string } } | undefined)?.feedback?.ticketEndpoint ?? '')
const canConvert = computed(() =>
  ticketEndpoint.value !== '' && userHasCapability(auth.user, 'tickets.manage'))

async function toTicket(row: FeedbackRow) {
  busyId.value = row.$id
  try {
    const res = await $fetch<{ ticketId: string }>(ticketEndpoint.value, {
      method: 'POST',
      body: { feedbackId: row.$id },
    })
    toast.add({
      title: t('feedback.admin.toTicketSuccess'),
      color: 'success',
      icon: 'i-ph-kanban',
      actions: [{
        label: t('feedback.admin.toTicketOpen'),
        onClick: () => { void navigateTo(`${localePath('/dashboard/tickets')}?ticket=${res.ticketId}`) },
      }],
    })
    await refresh()
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    toast.add({
      title: statusCode === 409 ? t('feedback.admin.toTicketExists') : t('feedback.admin.actionFailed'),
      color: statusCode === 409 ? 'warning' : 'error',
    })
  }
  finally {
    busyId.value = ''
  }
}

async function remove(row: FeedbackRow) {
  try {
    const ok = await confirm({
      title: t('feedback.admin.confirmDeleteTitle'),
      description: t('feedback.admin.confirmDeleteText'),
      confirmLabel: t('feedback.admin.delete'),
      action: () => $fetch(`/api/feedback/${row.$id}`, { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({ title: t('feedback.admin.deleted'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('feedback.admin.actionFailed'), color: 'error' })
  }
}

// Seite und Absender sind Kontext — auf schmalen Schirmen fallen sie weg.
const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const columns = computed<TableColumn<FeedbackRow>[]>(() => [
  { accessorKey: 'category', header: () => t('feedback.admin.col.category') },
  { accessorKey: 'message', header: () => t('feedback.admin.col.message') },
  { accessorKey: 'userName', header: () => t('feedback.admin.col.from'), meta: { class: HIDE_MD } },
  { accessorKey: 'page', header: () => t('feedback.admin.col.page'), meta: { class: HIDE_LG } },
  { accessorKey: '$createdAt', header: () => t('feedback.admin.col.date'), id: 'createdAt' },
  { id: 'actions', header: () => '' },
])

/**
 * Zeilen-Aktionen. `canConvert` bleibt das Gate für „Ticket daraus machen"
 * (Endpoint gesetzt UND tickets.manage) — der Umbau darf es nicht verlieren.
 */
function rowActions(row: FeedbackRow): DropdownMenuItem[][] {
  const items: DropdownMenuItem[] = []
  if (canConvert.value) {
    items.push({ label: t('feedback.admin.toTicket'), icon: 'i-ph-kanban', onSelect: () => { void toTicket(row) } })
  }
  items.push(row.status === 'open'
    ? { label: t('feedback.admin.markResolved'), icon: 'i-ph-check', onSelect: () => { void setDone(row, true) } }
    : { label: t('feedback.admin.reopen'), icon: 'i-ph-arrow-counter-clockwise', onSelect: () => { void setDone(row, false) } })
  return [
    items,
    [{ label: t('feedback.admin.delete'), icon: 'i-ph-trash', color: 'error', onSelect: () => { void remove(row) } }],
  ]
}
</script>

<template>
  <UDashboardPanel id="feedback-admin">
    <template #header>
      <UDashboardNavbar :title="`${t('feedback.admin.title')} (${data?.total ?? 0})`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="filterLinks" highlight class="-mx-1 flex-1" data-feedback-filter />
      </UDashboardToolbar>
    </template>

    <template #body>
      <ClientOnly>
        <template #fallback>
          <div class="flex justify-center py-16"><UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" /></div>
        </template>

        <div v-if="fetchStatus === 'pending' && !data" class="flex justify-center py-16">
          <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
        </div>

        <template v-else>
          <form class="mb-4 flex max-w-md gap-2" @submit.prevent="runSearch">
            <UInput
              v-model="search"
              icon="i-ph-magnifying-glass"
              :placeholder="t('feedback.admin.searchPlaceholder')"
              class="flex-1"
              data-feedback-search
            />
            <UButton type="submit" color="neutral" variant="subtle">{{ t('feedback.admin.search') }}</UButton>
          </form>

          <UTable :data="data?.rows ?? []" :columns="columns" data-testid="feedback-list">
            <template #createdAt-header>
              <SortableHeader :label="t('feedback.admin.col.date')" field="$createdAt" :active="sortField" :dir="sortDir" @toggle="toggle" />
            </template>

            <template #category-cell="{ row }">
              <span class="flex items-center gap-1.5 whitespace-nowrap">
                <UIcon :name="CATEGORY_ICON[row.original.category] ?? 'i-ph-chat-circle-dots'" class="size-4 shrink-0 text-muted" />
                {{ t(`feedback.categories.${row.original.category}`) }}
              </span>
            </template>
            <template #message-cell="{ row }">
              <p class="line-clamp-3 max-w-md min-w-0 whitespace-pre-line text-sm" :title="row.original.message">
                {{ row.original.message }}
              </p>
            </template>
            <template #userName-cell="{ row }">
              <span class="text-sm">{{ row.original.userName || t('feedback.admin.guest') }}</span>
            </template>
            <template #page-cell="{ row }">
              <span class="font-mono text-xs text-muted">{{ row.original.page || '—' }}</span>
            </template>
            <template #createdAt-cell="{ row }">
              <span class="whitespace-nowrap text-sm text-muted">{{ formatRelativeTime(row.original.$createdAt) }}</span>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end">
                <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
                  <UButton
                    icon="i-ph-dots-three-vertical"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :aria-label="t('feedback.admin.rowActions')"
                    :loading="busyId === row.original.$id"
                    :data-feedback-actions="row.original.$id"
                  />
                </UDropdownMenu>
              </div>
            </template>

            <template #empty>
              <CoreEmptyState
                v-if="hasActiveFilter"
                icon="i-ph-funnel"
                :title="t('ui.empty.noResultsTitle')"
                :description="t('ui.empty.noResultsText')"
                :action-label="t('ui.empty.resetFilters')"
                action-icon="i-ph-arrow-counter-clockwise"
                @action="resetFilters"
              />
              <CoreEmptyState
                v-else
                icon="i-ph-tray"
                :title="t('feedback.admin.emptyTitle')"
                :description="t('feedback.admin.empty')"
                data-testid="feedback-empty"
              />
            </template>
          </UTable>
        </template>

        <UPagination
          v-if="(data?.total ?? 0) > 50"
          class="mt-4"
          :page="page"
          :total="data?.total ?? 0"
          :items-per-page="50"
          @update:page="setPage"
        />
      </ClientOnly>
    </template>
  </UDashboardPanel>
</template>
