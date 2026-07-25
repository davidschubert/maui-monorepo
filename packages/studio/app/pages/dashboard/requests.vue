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
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t, locale } = useI18n()
const toast = useToast()
useHead({ title: () => t('studio.requests.title') })

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
  '/api/studio/invite-requests',
  { lazy: true, server: false },
)
const requests = computed(() => data.value?.requests ?? [])
const stats = computed(() => data.value?.stats)

const busy = ref<string | null>(null)

async function assign(request: RequestDto) {
  busy.value = request.id
  try {
    const result = await $fetch<{ reminder: boolean }>(`/api/studio/invite-requests/${request.id}/assign`, { method: 'POST' })
    toast.add({ title: t(result.reminder ? 'studio.requests.reminded' : 'studio.requests.assigned', { email: request.email }), color: 'success' })
    await refresh()
  }
  catch (error) {
    const status = (error as { status?: number, statusCode?: number }).status ?? (error as { statusCode?: number }).statusCode
    toast.add({
      // 502 = Code steht, aber die Mail ging nicht raus. Das ist ein anderer
      // Zustand als „hat nicht geklappt" und muss anders klingen.
      title: t(status === 502 ? 'studio.requests.mailFailed' : 'studio.requests.assignFailed'),
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
    await $fetch(`/api/studio/invite-requests/${request.id}`, { method: 'PATCH', body: { status: next } })
    await refresh()
  }
  catch {
    toast.add({ title: t('studio.requests.updateFailed'), color: 'error' })
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
</script>

<template>
  <UDashboardPanel id="requests">
    <template #header>
      <UDashboardNavbar :title="t('studio.requests.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-arrows-clockwise"
            color="neutral"
            variant="ghost"
            :loading="status === 'pending'"
            :aria-label="t('studio.requests.refresh')"
            @click="refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-4 text-sm text-muted">{{ t('studio.requests.subtitle') }}</p>

      <!-- Kennzahlen: was wartet, was läuft, was ist angekommen -->
      <div v-if="stats" class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4" data-request-stats>
        <div v-for="key in (['new', 'waiting', 'redeemed', 'total'] as const)" :key="key" class="rounded-xl border border-default p-4">
          <p class="text-2xl font-semibold tabular-nums">{{ stats[key] }}</p>
          <p class="text-sm text-muted">{{ t(`studio.requests.stats.${key}`) }}</p>
        </div>
      </div>

      <p v-if="!requests.length" class="py-12 text-center text-sm text-muted" data-requests-empty>
        {{ t('studio.requests.empty') }}
      </p>

      <div v-else class="divide-y divide-default" data-requests-list>
        <div v-for="request in requests" :key="request.id" class="flex flex-wrap items-start justify-between gap-3 py-4">
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium">{{ request.email }}</p>
              <UBadge :color="statusColor[request.status]" variant="subtle" size="sm">
                {{ t(`studio.requests.status.${request.status}`) }}
              </UBadge>
              <UBadge v-if="request.reminders" color="neutral" variant="subtle" size="sm">
                {{ t('studio.requests.reminderCount', { count: request.reminders }) }}
              </UBadge>
            </div>

            <p v-if="request.note" class="max-w-prose text-sm text-muted">„{{ request.note }}"</p>

            <!-- Die eine Zeile, die sagt, was Sache ist -->
            <p class="text-sm text-dimmed">
              <template v-if="request.status === 'redeemed'">
                {{ t('studio.requests.redeemedOn', { date: formatDate(request.redeemedAt) }) }}
                <template v-if="request.host">
                  · <a :href="`https://${request.host}`" target="_blank" rel="noopener" class="font-mono hover:underline">{{ request.host }}</a>
                </template>
              </template>
              <template v-else-if="request.status === 'assigned'">
                {{ t('studio.requests.assignedOn', { date: formatDate(request.assignedAt) }) }}
                <template v-if="daysUntil(request.codeExpiresAt) !== null">
                  ·
                  <span :class="(daysUntil(request.codeExpiresAt) ?? 99) <= 3 ? 'text-warning' : ''">
                    {{ (daysUntil(request.codeExpiresAt) ?? 0) > 0
                      ? t('studio.requests.codeExpiresIn', { days: daysUntil(request.codeExpiresAt) })
                      : t('studio.requests.codeExpired') }}
                  </span>
                </template>
              </template>
              <template v-else>
                {{ t('studio.requests.askedOn', { date: formatDate(request.createdAt) }) }}
              </template>
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <template v-if="request.status === 'redeemed'">
              <UButton
                v-if="request.host"
                :to="`https://${request.host}`"
                external
                target="_blank"
                color="neutral"
                variant="ghost"
                size="sm"
                trailing-icon="i-ph-arrow-up-right"
                :label="t('studio.requests.openSite')"
              />
            </template>

            <template v-else-if="request.status === 'assigned'">
              <UButton
                :color="request.remindSuggested ? 'primary' : 'neutral'"
                :variant="request.remindSuggested ? 'solid' : 'ghost'"
                size="sm"
                icon="i-ph-bell-ringing"
                :loading="busy === request.id"
                :disabled="!request.canRemind"
                :title="!request.canRemind ? t(`studio.requests.remindBlocked.${request.remindBlocked || 'cooldown'}`) : ''"
                :label="t('studio.requests.remind')"
                @click="assign(request)"
              />
            </template>

            <template v-else>
              <UButton
                size="sm"
                icon="i-ph-paper-plane-tilt"
                :loading="busy === request.id"
                :label="t('studio.requests.assign')"
                @click="assign(request)"
              />
              <UButton
                v-if="request.status !== 'deferred'"
                color="neutral"
                variant="ghost"
                size="sm"
                :label="t('studio.requests.defer')"
                @click="setStatus(request, 'deferred')"
              />
              <UButton
                v-if="request.status !== 'declined'"
                color="neutral"
                variant="ghost"
                size="sm"
                :label="t('studio.requests.decline')"
                @click="setStatus(request, 'declined')"
              />
            </template>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
