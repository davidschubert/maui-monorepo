<script setup lang="ts">
import type { FeedbackListResponse, FeedbackRow } from '../../../shared/types/feedback'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'feedback.manage' })

const { t } = useI18n()
const toast = useToast()
const { formatRelativeTime } = useFormatRelativeTime()
const { page, setPage } = usePagination()
const appConfig = useAppConfig()
const auth = useAuthStore()
const localePath = useLocalePath()

useHead({ title: () => t('feedback.admin.title') })

// Filter-Tabs im Toolbar-Muster der Kommentar-Moderation (Alle/Offen/Erledigt)
type FeedbackFilter = 'all' | 'open' | 'resolved'
const FILTERS: FeedbackFilter[] = ['all', 'open', 'resolved']
const FILTER_ICON: Record<FeedbackFilter, string> = {
  all: 'i-ph-list-bullets',
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

const { data, status: fetchStatus, refresh } = await useFetch<FeedbackListResponse>('/api/feedback', {
  query: computed(() => ({ ...(filter.value === 'all' ? {} : { status: filter.value }), page: page.value })),
  lazy: true,
  server: false,
})

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
  busyId.value = row.$id
  try {
    await $fetch(`/api/feedback/${row.$id}`, { method: 'DELETE' })
    toast.add({ title: t('feedback.admin.deleted'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('feedback.admin.actionFailed'), color: 'error' })
  }
  finally {
    busyId.value = ''
  }
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

        <p v-else-if="!data?.rows.length" class="py-16 text-center text-sm text-muted" data-testid="feedback-empty">
          {{ t('feedback.admin.empty') }}
        </p>

        <ul v-else class="divide-y divide-default" data-testid="feedback-list">
          <li v-for="row in data.rows" :key="row.$id" class="flex items-start gap-3 py-3 text-sm">
            <UIcon :name="CATEGORY_ICON[row.category] ?? 'i-ph-chat-circle-dots'" class="mt-0.5 size-4 shrink-0 text-muted" />
            <div class="min-w-0 flex-1">
              <p class="whitespace-pre-line">{{ row.message }}</p>
              <p class="mt-1 text-xs text-muted">
                {{ row.userName || t('feedback.admin.guest') }}
                <template v-if="row.page"> · {{ row.page }}</template>
                · {{ formatRelativeTime(row.$createdAt) }}
              </p>
            </div>
            <UButton
              v-if="canConvert"
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-ph-kanban"
              :loading="busyId === row.$id"
              :data-feedback-ticket="row.$id"
              @click="toTicket(row)"
            >
              {{ t('feedback.admin.toTicket') }}
            </UButton>
            <UButton
              :color="row.status === 'open' ? 'success' : 'neutral'"
              variant="ghost"
              size="xs"
              :icon="row.status === 'open' ? 'i-ph-check' : 'i-ph-arrow-counter-clockwise'"
              :loading="busyId === row.$id"
              :data-feedback-toggle="row.$id"
              @click="setDone(row, row.status === 'open')"
            >
              {{ row.status === 'open' ? t('feedback.admin.markResolved') : t('feedback.admin.reopen') }}
            </UButton>
            <UButton
              color="error" variant="ghost" size="xs" icon="i-ph-trash"
              :disabled="busyId === row.$id"
              @click="remove(row)"
            />
          </li>
        </ul>

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
