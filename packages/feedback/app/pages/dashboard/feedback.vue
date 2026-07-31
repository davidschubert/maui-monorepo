<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import {
  FEEDBACK_PAGE_SIZE,
  FEEDBACK_SORTS,
  FEEDBACK_STATES,
  type FeedbackEntry,
  type FeedbackSort,
  type FeedbackState,
} from '../../../../control/shared/customerFeedback'
import type { FeedbackListResponse } from '../../composables/useCustomerFeedback'

/**
 * Der Feedback-Bereich — Bestandteil ALLER Dashboards (Plan § Mitreden), nicht
 * nur des Betreiber-Dashboards: hier wird gewählt und kommentiert, das Gewicht
 * entsteht also bei den Nutzern.
 *
 * SORTIEREN (Trending · Top · New) und FILTERN (nach Board-Zustand) stehen als
 * getrennte Reihen im Werkzeugband — sie beantworten zwei verschiedene Fragen
 * („was ist gerade laut?" vs. „was ist geplant?") und sollen deshalb nicht in
 * ein gemeinsames Menü.
 *
 * `UTable` ist der Standard für Datenlisten (Davids Entscheidung B6) — mit
 * einer Wähl-Zelle links; Sortierung und Paginierung kommen mitgeliefert. Die
 * Sortier-KÖPFE fehlen bewusst: die Reihenfolge bestimmt hier die Trending/
 * Top/New-Wahl, zwei konkurrierende Sortierungen wären eine Falle.
 *
 * SAUBER DEGRADIEREN (Entscheidung 1): antwortet control nicht, kommt
 * `available: false` — dann steht hier ein Hinweis statt einer Fehlerseite.
 * Der Feedback-Bereich darf das Dashboard nicht mitreißen.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth'], requiredCapability: 'dashboard.access' })

const { t } = useI18n()
const { formatRelativeTime } = useFormatRelativeTime()
const { page, setPage } = usePagination({ pageSize: FEEDBACK_PAGE_SIZE })
const { toggleVote } = useCustomerFeedback()

useHead({ title: () => t('feedback.list.title') })

const sort = ref<FeedbackSort>('trending')
const state = ref<FeedbackState | ''>('')
watch([sort, state], () => setPage(1))

const SORT_ICON: Record<FeedbackSort, string> = {
  trending: 'i-ph-trend-up',
  top: 'i-ph-crown-simple',
  new: 'i-ph-sparkle',
}

const sortLinks = computed(() => FEEDBACK_SORTS.map(value => ({
  label: t(`feedback.sorts.${value}`),
  icon: SORT_ICON[value],
  active: sort.value === value,
  onSelect: () => { sort.value = value },
})))

const stateLinks = computed(() => [
  { label: t('feedback.list.allStates'), active: state.value === '', onSelect: () => { state.value = '' } },
  ...FEEDBACK_STATES.map(value => ({
    label: t(`feedback.states.${value}`),
    active: state.value === value,
    onSelect: () => { state.value = value },
  })),
])

const { data, status: fetchStatus, refresh } = await useFetch<FeedbackListResponse>('/api/feedback', {
  query: computed(() => ({ sort: sort.value, state: state.value, page: page.value })),
  lazy: true,
  server: false,
})

const entries = computed(() => data.value?.entries ?? [])
const isOperator = computed(() => data.value?.operator === true)
const unavailable = computed(() => data.value?.available === false)

const hasActiveFilter = computed(() => state.value !== '')
function resetFilters() {
  state.value = ''
  sort.value = 'trending'
}

// Detail als Slideover: die Liste bleibt stehen, während man einen Eintrag
// liest, wählt und kommentiert — ein Seitenwechsel würde die Sortierung, die
// man gerade untersucht, jedes Mal neu holen.
const selected = ref<FeedbackEntry | null>(null)
const detailOpen = computed({
  get: () => selected.value !== null,
  set: (value: boolean) => { if (!value) selected.value = null },
})

const votingId = ref('')
async function onVote(entry: FeedbackEntry) {
  votingId.value = entry.id
  await toggleVote(entry)
  votingId.value = ''
}

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const columns = computed<TableColumn<FeedbackEntry>[]>(() => [
  { id: 'vote', header: () => '' },
  { accessorKey: 'title', header: () => t('feedback.list.col.entry') },
  { accessorKey: 'state', header: () => t('feedback.list.col.state'), meta: { class: HIDE_MD } },
  { accessorKey: 'commentCount', header: () => t('feedback.list.col.comments'), meta: { class: HIDE_LG } },
  { accessorKey: 'createdAt', header: () => t('feedback.list.col.date'), meta: { class: HIDE_LG } },
  // Herkunft steht NUR beim Betreiber in der Tabelle — bei allen anderen
  // kommt sie gar nicht erst über die Leitung (Entscheidung 2).
  ...(isOperator.value ? [{ accessorKey: 'origin', header: () => t('feedback.list.col.origin'), meta: { class: HIDE_MD } }] : []),
])
</script>

<template>
  <UDashboardPanel id="customer-feedback">
    <template #header>
      <UDashboardNavbar :title="t('feedback.list.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-ph-arrow-clockwise"
            :aria-label="t('feedback.list.refresh')"
            :loading="fetchStatus === 'pending'"
            @click="refresh()"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="sortLinks" highlight class="-mx-1 flex-1" data-feedback-sort />
      </UDashboardToolbar>
      <UDashboardToolbar>
        <UNavigationMenu :items="stateLinks" highlight class="-mx-1 flex-1" data-feedback-state-filter />
      </UDashboardToolbar>
    </template>

    <template #body>
      <ClientOnly>
        <template #fallback>
          <div class="flex justify-center py-16"><UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" /></div>
        </template>

        <CoreEmptyState
          v-if="unavailable"
          icon="i-ph-plugs"
          :title="t('feedback.list.unavailableTitle')"
          :description="t('feedback.list.unavailableText')"
          data-testid="feedback-unavailable"
        />

        <div v-else-if="fetchStatus === 'pending' && !data" class="flex justify-center py-16">
          <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
        </div>

        <template v-else>
          <UTable :data="entries" :columns="columns" data-testid="feedback-list">
            <template #vote-cell="{ row }">
              <FeedbackVoteButton :entry="row.original" :busy="votingId === row.original.id" @toggle="onVote(row.original)" />
            </template>

            <template #title-cell="{ row }">
              <button type="button" class="min-w-0 max-w-md cursor-pointer text-left" @click="() => { selected = row.original }">
                <span class="block font-medium">{{ row.original.title }}</span>
                <span class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <UBadge color="neutral" variant="outline" size="sm">{{ t(`feedback.areas.${row.original.area}`) }}</UBadge>
                  <span v-if="row.original.productKey" class="font-mono">{{ row.original.productKey }}</span>
                  <UBadge v-if="row.original.status === 'hidden'" color="warning" variant="subtle" size="sm">
                    {{ t('feedback.list.hidden') }}
                  </UBadge>
                  <UBadge v-if="row.original.mine" color="primary" variant="subtle" size="sm">
                    {{ t('feedback.list.mine') }}
                  </UBadge>
                </span>
              </button>
            </template>

            <template #state-cell="{ row }">
              <UBadge color="neutral" variant="subtle" size="sm" class="whitespace-nowrap">
                {{ t(`feedback.states.${row.original.state}`) }}
              </UBadge>
            </template>

            <template #commentCount-cell="{ row }">
              <span class="flex items-center gap-1 text-sm text-muted">
                <UIcon name="i-ph-chat-circle" class="size-4" />{{ row.original.commentCount }}
              </span>
            </template>

            <template #createdAt-cell="{ row }">
              <span class="whitespace-nowrap text-sm text-muted">{{ formatRelativeTime(row.original.createdAt) }}</span>
            </template>

            <template #origin-cell="{ row }">
              <span class="text-sm text-muted">
                {{ row.original.origin?.communityName || row.original.origin?.authorName || t('feedback.admin.anonymous') }}
              </span>
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
                icon="i-ph-megaphone-simple"
                :title="t('feedback.list.emptyTitle')"
                :description="t('feedback.list.emptyText')"
                data-testid="feedback-empty"
              />
            </template>
          </UTable>

          <UPagination
            v-if="(data?.total ?? 0) > FEEDBACK_PAGE_SIZE"
            class="mt-4"
            :page="page"
            :total="data?.total ?? 0"
            :items-per-page="FEEDBACK_PAGE_SIZE"
            @update:page="setPage"
          />
        </template>
      </ClientOnly>

      <USlideover v-model:open="detailOpen" :title="t('feedback.list.detailTitle')">
        <template #body>
          <FeedbackDetail v-if="selected" :entry="selected" :operator="isOperator" />
        </template>
      </USlideover>
    </template>
  </UDashboardPanel>
</template>
