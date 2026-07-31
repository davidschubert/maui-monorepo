<script setup lang="ts">
import { FEEDBACK_STATES, type FeedbackEntry, type FeedbackState } from '../../../../control/shared/customerFeedback'
import type { FeedbackListResponse } from '../../composables/useCustomerFeedback'

/**
 * Die Roadmap: dieselben Einträge wie im Feedback-Bereich, nur nach Zustand
 * aufgestellt — `Under Review` → `Planned` → `In Progress` → `Complete`
 * (Plan § Board-Zustände; die Reihenfolge kommt aus FEEDBACK_STATES, damit
 * Spalten und Filter nie auseinanderlaufen).
 *
 * WARUM DAS NICHT DAS TICKET-BOARD IST: der Plan verlangt für die Roadmap
 * genau die Dinge, die am Feedback-Eintrag hängen — Stimmen, Kommentare,
 * Sichtbarkeit für alle Dashboards. Ein Ticket hat davon nichts und ist
 * `tickets.manage`-gated. Das Board bleibt daher das interne Werkzeug des
 * Betreibers (eigener Menüpunkt), die Roadmap ist die öffentliche Sicht auf
 * die Kundenwünsche.
 *
 * VERSCHIEBEN IST BETREIBER-SACHE: die Zustands-Knöpfe stecken im Detail und
 * erscheinen nur, wenn der Server `operator: true` schickt. Bewusst KEIN
 * Ziehen-und-Fallenlassen — vier Spalten mit je einem Klick sind auf dem
 * Telefon bedienbar, eine Drag-Fläche ist es nicht.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth'], requiredCapability: 'dashboard.access' })

const { t } = useI18n()
const { toggleVote } = useCustomerFeedback()

useHead({ title: () => t('feedback.roadmap.title') })

const STATE_ICON: Record<FeedbackState, string> = {
  under_review: 'i-ph-eye',
  planned: 'i-ph-calendar-check',
  in_progress: 'i-ph-hammer',
  complete: 'i-ph-check-circle',
}

/**
 * EIN Abruf für alle vier Spalten (sortiert nach Stimmen), statt vier Abrufe
 * mit je eigenem Zustands-Filter: die Roadmap ist eine Übersicht, und vier
 * parallele Rufe über die Service-Naht wären vierfache Latenz für dieselbe
 * Antwort. Der Deckel ist bewusst sichtbar — was darunter nicht mehr passt,
 * findet man im Feedback-Bereich mit Filter.
 */
const { data, status: fetchStatus, refresh } = await useFetch<FeedbackListResponse>('/api/feedback', {
  query: { sort: 'top', page: 1 },
  lazy: true,
  server: false,
})

const isOperator = computed(() => data.value?.operator === true)
const unavailable = computed(() => data.value?.available === false)

const columns = computed(() => FEEDBACK_STATES.map(state => ({
  state,
  icon: STATE_ICON[state],
  entries: (data.value?.entries ?? []).filter(entry => entry.state === state),
})))

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

// Nach dem Verschieben im Detail muss die Spalten-Aufteilung neu gerechnet
// werden — der Eintrag wandert, die Liste dahinter ist dieselbe.
watch(detailOpen, (open) => { if (!open) void refresh() })
</script>

<template>
  <UDashboardPanel id="customer-roadmap">
    <template #header>
      <UDashboardNavbar :title="t('feedback.roadmap.title')">
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
        />

        <div v-else-if="fetchStatus === 'pending' && !data" class="flex justify-center py-16">
          <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
        </div>

        <!-- Vier Spalten nebeneinander; auf schmalen Schirmen untereinander. -->
        <div v-else data-testid="feedback-roadmap">
          <p class="mb-4 text-sm text-muted">{{ t('feedback.roadmap.subtitle') }}</p>
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <section v-for="column in columns" :key="column.state" class="min-w-0 space-y-2">
              <h2 class="flex items-center gap-2 px-1 text-sm font-semibold">
                <UIcon :name="column.icon" class="size-4 text-muted" />
                {{ t(`feedback.states.${column.state}`) }}
                <span class="text-xs font-normal text-dimmed tabular-nums">{{ column.entries.length }}</span>
              </h2>

              <p v-if="!column.entries.length" class="rounded-lg border border-dashed border-default px-3 py-6 text-center text-xs text-dimmed">
                {{ t('feedback.roadmap.emptyColumn') }}
              </p>

              <article
                v-for="entry in column.entries"
                :key="entry.id"
                class="flex items-start gap-2 rounded-lg border border-default bg-elevated/40 p-3"
                :data-feedback-card="entry.id"
              >
                <FeedbackVoteButton :entry="entry" :busy="votingId === entry.id" @toggle="onVote(entry)" />
                <button type="button" class="min-w-0 flex-1 cursor-pointer text-left" @click="() => { selected = entry }">
                  <span class="block text-sm font-medium">{{ entry.title }}</span>
                  <span class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <UBadge color="neutral" variant="outline" size="sm">{{ t(`feedback.areas.${entry.area}`) }}</UBadge>
                    <span class="flex items-center gap-1">
                      <UIcon name="i-ph-chat-circle" class="size-3.5" />{{ entry.commentCount }}
                    </span>
                  </span>
                </button>
              </article>
            </section>
          </div>
        </div>
      </ClientOnly>

      <USlideover v-model:open="detailOpen" :title="t('feedback.list.detailTitle')">
        <template #body>
          <FeedbackDetail v-if="selected" :entry="selected" :operator="isOperator" />
        </template>
      </USlideover>
    </template>
  </UDashboardPanel>
</template>
