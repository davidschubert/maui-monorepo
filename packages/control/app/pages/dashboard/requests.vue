<script setup lang="ts">
/**
 * Early-Access-Warteschlange (studio-017).
 *
 * Die Seite beantwortet in dieser Reihenfolge: Wer wartet? · Wem habe ich
 * schon einen Code geschickt, und wurde er eingelöst? · Wo muss ich nachfassen?
 *
 * Der Klartext eines Codes kommt hier NIE vor — er existiert nur zwischen
 * Erzeugung und Mail. „Zuweisen" verschickt ihn direkt; „Erinnern" stellt einen
 * neuen aus und sperrt den alten (denselben können wir nicht schicken, wir
 * kennen ihn nicht).
 */
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t, locale } = useI18n()
const toast = useToast()
useHead({ title: () => t('control.requests.title') })

interface RequestDto {
  id: string
  email: string
  note: string
  status: 'new' | 'assigned' | 'redeemed' | 'declined' | 'deferred'
  createdAt: string
  assignedAt: string | null
  redeemedAt: string | null
  host: string
  reminders: number
  lastReminderAt: string | null
  codeExpiresAt: string | null
  codeStatus: string
  canRemind: boolean
  remindBlocked: string
  remindSuggested: boolean
}
interface Stats { total: number, new: number, assigned: number, redeemed: number, declined: number, deferred: number, waiting: number }

const { data, refresh, status } = await useFetch<{ total: number, stats: Stats, requests: RequestDto[] }>(
  '/api/control/invite-requests',
  { lazy: true, server: false },
)
const requests = computed(() => data.value?.requests ?? [])
const stats = computed(() => data.value?.stats)

const busy = ref<string | null>(null)

async function assign(request: RequestDto) {
  busy.value = request.id
  try {
    const result = await $fetch<{ reminder: boolean }>(`/api/control/invite-requests/${request.id}/assign`, { method: 'POST' })
    toast.add({ title: t(result.reminder ? 'control.requests.reminded' : 'control.requests.assigned', { email: request.email }), color: 'success' })
    await refresh()
  }
  catch (error) {
    const status = (error as { status?: number, statusCode?: number }).status ?? (error as { statusCode?: number }).statusCode
    toast.add({
      // 502 = Code steht, aber die Mail ging nicht raus. Das ist ein anderer
      // Zustand als „hat nicht geklappt" und muss anders klingen.
      title: t(status === 502 ? 'control.requests.mailFailed' : 'control.requests.assignFailed'),
      description: (error as { statusMessage?: string })?.statusMessage,
      color: status === 502 ? 'warning' : 'error',
    })
    await refresh()
  }
  finally {
    busy.value = null
  }
}

async function setStatus(request: RequestDto, next: 'declined' | 'deferred' | 'new') {
  busy.value = request.id
  try {
    await $fetch(`/api/control/invite-requests/${request.id}`, { method: 'PATCH', body: { status: next } })
    await refresh()
  }
  catch {
    toast.add({ title: t('control.requests.updateFailed'), color: 'error' })
  }
  finally {
    busy.value = null
  }
}

const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
function formatDate(value: string | null): string {
  if (!value) return ''
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? dateFormat.value.format(parsed) : ''
}
function daysUntil(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return Math.ceil((parsed - Date.now()) / 86_400_000)
}

const statusColor: Record<RequestDto['status'], 'neutral' | 'info' | 'success' | 'warning'> = {
  new: 'info',
  assigned: 'warning',
  redeemed: 'success',
  declined: 'neutral',
  deferred: 'neutral',
}

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }

const columns = computed<TableColumn<RequestDto>[]>(() => [
  { accessorKey: 'email', header: () => t('control.requests.col.email') },
  { accessorKey: 'note', header: () => t('control.requests.col.note'), meta: { class: HIDE_MD } },
  { accessorKey: 'status', header: () => t('control.requests.col.status') },
  { id: 'state', header: () => t('control.requests.col.state') },
  { id: 'actions', header: () => '' },
])

/**
 * Zeilen-Aktionen — die Fallunterscheidung nach Status bleibt exakt die
 * gleiche wie vorher in der Knopfleiste: eingelöst → Site öffnen, zugewiesen
 * → erinnern (nur wenn canRemind), sonst zuweisen/zurückstellen/ablehnen.
 */
function rowActions(request: RequestDto): DropdownMenuItem[][] {
  if (request.status === 'redeemed') {
    return request.host
      ? [[{ label: t('control.requests.openSite'), icon: 'i-ph-arrow-up-right', to: `https://${request.host}`, target: '_blank' }]]
      : []
  }
  if (request.status === 'assigned') {
    return [[{
      label: t('control.requests.remind'),
      icon: 'i-ph-bell-ringing',
      disabled: !request.canRemind,
      onSelect: () => { void assign(request) },
    }]]
  }
  const items: DropdownMenuItem[] = [
    { label: t('control.requests.assign'), icon: 'i-ph-paper-plane-tilt', onSelect: () => { void assign(request) } },
  ]
  if (request.status !== 'deferred') {
    items.push({ label: t('control.requests.defer'), icon: 'i-ph-clock-counter-clockwise', onSelect: () => { void setStatus(request, 'deferred') } })
  }
  if (request.status !== 'declined') {
    items.push({ label: t('control.requests.decline'), icon: 'i-ph-x', color: 'error', onSelect: () => { void setStatus(request, 'declined') } })
  }
  return [items]
}
</script>

<template>
  <UDashboardPanel id="requests">
    <template #header>
      <UDashboardNavbar :title="t('control.requests.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-arrows-clockwise"
            color="neutral"
            variant="ghost"
            :loading="status === 'pending'"
            :aria-label="t('control.requests.refresh')"
            @click="refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-4 text-sm text-muted">{{ t('control.requests.subtitle') }}</p>

      <!-- Kennzahlen: was wartet, was läuft, was ist angekommen -->
      <div v-if="stats" class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4" data-request-stats>
        <div v-for="key in (['new', 'waiting', 'redeemed', 'total'] as const)" :key="key" class="rounded-xl border border-default p-4">
          <p class="text-2xl font-semibold tabular-nums">{{ stats[key] }}</p>
          <p class="text-sm text-muted">{{ t(`control.requests.stats.${key}`) }}</p>
        </div>
      </div>

      <UTable :data="requests" :columns="columns" data-requests-list>
        <template #email-cell="{ row }">
          <div class="min-w-0">
            <p class="font-medium">{{ row.original.email }}</p>
            <p v-if="row.original.reminders" class="text-xs text-muted">
              {{ t('control.requests.reminderCount', { count: row.original.reminders }) }}
            </p>
          </div>
        </template>
        <template #note-cell="{ row }">
          <p v-if="row.original.note" class="line-clamp-2 max-w-xs text-sm text-muted" :title="row.original.note">„{{ row.original.note }}"</p>
          <span v-else class="text-muted">—</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="statusColor[row.original.status]" variant="subtle" size="sm">
            {{ t(`control.requests.status.${row.original.status}`) }}
          </UBadge>
        </template>
        <!-- Die eine Zeile, die sagt, was Sache ist -->
        <template #state-cell="{ row }">
          <div class="text-sm text-dimmed">
            <template v-if="row.original.status === 'redeemed'">
              {{ t('control.requests.redeemedOn', { date: formatDate(row.original.redeemedAt) }) }}
              <template v-if="row.original.host">
                · <a :href="`https://${row.original.host}`" target="_blank" rel="noopener" class="font-mono hover:underline">{{ row.original.host }}</a>
              </template>
            </template>
            <template v-else-if="row.original.status === 'assigned'">
              {{ t('control.requests.assignedOn', { date: formatDate(row.original.assignedAt) }) }}
              <template v-if="daysUntil(row.original.codeExpiresAt) !== null">
                ·
                <span :class="(daysUntil(row.original.codeExpiresAt) ?? 99) <= 3 ? 'text-warning' : ''">
                  {{ (daysUntil(row.original.codeExpiresAt) ?? 0) > 0
                    ? t('control.requests.codeExpiresIn', { days: daysUntil(row.original.codeExpiresAt) })
                    : t('control.requests.codeExpired') }}
                </span>
              </template>
            </template>
            <template v-else>
              {{ t('control.requests.askedOn', { date: formatDate(row.original.createdAt) }) }}
            </template>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu v-if="rowActions(row.original).length" :items="rowActions(row.original)" :content="{ align: 'end' }">
              <UButton
                :icon="row.original.remindSuggested ? 'i-ph-bell-ringing' : 'i-ph-dots-three-vertical'"
                :color="row.original.remindSuggested ? 'primary' : 'neutral'"
                :variant="row.original.remindSuggested ? 'soft' : 'ghost'"
                size="xs"
                :aria-label="t('control.requests.rowActions')"
                :loading="busy === row.original.id"
                :title="row.original.status === 'assigned' && !row.original.canRemind
                  ? t(`control.requests.remindBlocked.${row.original.remindBlocked || 'cooldown'}`)
                  : ''"
              />
            </UDropdownMenu>
          </div>
        </template>

        <template #empty>
          <CoreEmptyState
            icon="i-ph-envelope-simple"
            :title="t('control.requests.emptyTitle')"
            :description="t('control.requests.empty')"
            data-requests-empty
          />
        </template>
      </UTable>
    </template>
  </UDashboardPanel>
</template>
