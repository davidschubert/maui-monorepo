<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { isDisplayableReportUrl, type AbuseReportStats, type AbuseReportView } from '../../../shared/abuseReports'

/**
 * Missbrauchs-Warteschlange (M13, Auslöser 3).
 *
 * Hier trifft ein MENSCH die Entscheidung. Eine Meldung allein bewirkt nichts —
 * sonst wären fünf erfundene Meldungen eine Waffe gegen jede Community. Zwei
 * Ausgänge, mehr nicht: sperren (dann geht der Host sofort offline) oder
 * verwerfen.
 *
 * DAS SPERREN PASSIERT VON HIER AUS, nicht in der Communities-Liste: der
 * Betreiber liest den Vorwurf, entscheidet und schaltet ab — drei Schritte an
 * einem Ort. Wer erst hier liest und dann in einer anderen Liste sucht,
 * vergisst irgendwann den zweiten Teil. Geschrieben wird trotzdem über
 * dieselbe eine Sperr-Funktion, also steht der Vorgang im gleichen Protokoll.
 *
 * UTable nach Davids Regel B6: eine Datenliste mit Zeilen-Aktionen, genau der
 * Fall, für den die Regel gemacht ist.
 *
 * DER GEMELDETE LINK IST BELEG, DER KLICK NUR KOMFORT (Audit-Befund). Er kommt
 * aus einem Formular OHNE Anmeldung und wird hier von jemandem mit
 * `sites.manage` geöffnet — die teuerste Session, die es in diesem Haus gibt.
 * Deshalb entscheidet die PURE Regel `isDisplayableReportUrl`, ob ein `<a>`
 * entsteht: nur `http(s):` wird klickbar, alles andere steht als Text da und
 * ist damit immer noch vollständig lesbar. Der Eingang normalisiert bereits
 * (`normalizeReportedUrl`), diese Prüfung ist die zweite Hälfte für
 * Bestandszeilen von davor — eine Oberfläche, die sich auf „ist ja schon
 * geprüft" verlässt, prüft irgendwann gar nicht mehr.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t } = useI18n()
const toast = useToast()
useHead({ title: () => t('control.abuse.title') })

const { data, refresh, status } = await useFetch<{ total: number, stats: AbuseReportStats, reports: AbuseReportView[] }>(
  '/api/control/abuse-reports', { lazy: true, server: false },
)
const reports = computed(() => data.value?.reports ?? [])
const stats = computed(() => data.value?.stats)

const busy = ref<string | null>(null)

// ── Sperren aus der Meldung heraus ──────────────────────────────────────────
const showSuspend = ref(false)
const suspendTarget = ref<AbuseReportView | null>(null)
const suspendReason = ref('')
const suspendSaving = ref(false)

function openSuspend(report: AbuseReportView) {
  suspendTarget.value = report
  suspendReason.value = ''
  showSuspend.value = true
}

async function submitSuspend() {
  const report = suspendTarget.value
  if (!report) return
  suspendSaving.value = true
  try {
    await $fetch(`/api/control/abuse-reports/${report.id}`, {
      method: 'PATCH',
      body: { status: 'suspended', reason: suspendReason.value },
    })
    toast.add({ title: t('control.abuse.suspended'), description: t('control.abuse.suspendedHint', { host: report.host }), color: 'success' })
    showSuspend.value = false
    await refresh()
  }
  catch (error) {
    // 409/no_community = der gemeldete Host gehört zu keiner Community. Das ist
    // ein Zustand, kein Fehler — und er verdient einen eigenen Satz, sonst
    // sucht der Betreiber den Grund im Server.
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    toast.add({
      title: reason === 'no_community' ? t('control.abuse.noCommunity') : t('control.abuse.actionFailed'),
      description: reason === 'no_community' ? t('control.abuse.noCommunityHint') : t('control.abuse.actionFailedHint'),
      color: reason === 'no_community' ? 'warning' : 'error',
    })
  }
  finally {
    suspendSaving.value = false
  }
}

async function setStatus(report: AbuseReportView, nextStatus: 'dismissed' | 'open') {
  busy.value = report.id
  try {
    await $fetch(`/api/control/abuse-reports/${report.id}`, { method: 'PATCH', body: { status: nextStatus } })
    toast.add({ title: t('control.abuse.updated'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('control.abuse.actionFailed'), description: t('control.abuse.actionFailedHint'), color: 'error' })
  }
  finally {
    busy.value = null
  }
}

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }

const columns = computed<TableColumn<AbuseReportView>[]>(() => [
  { accessorKey: 'host', header: () => t('control.abuse.col.target') },
  { accessorKey: 'category', header: () => t('control.abuse.col.category'), meta: { class: HIDE_MD } },
  { accessorKey: 'message', header: () => t('control.abuse.col.message') },
  { accessorKey: 'status', header: () => t('control.abuse.col.status') },
  { id: 'actions', header: () => '' },
])

function rowActions(report: AbuseReportView): DropdownMenuItem[][] {
  if (report.status === 'open') {
    return [[
      { label: t('control.abuse.suspend'), icon: 'i-ph-lock-simple', color: 'error' as const, onSelect: () => { openSuspend(report) } },
      { label: t('control.abuse.dismiss'), icon: 'i-ph-x', onSelect: () => { void setStatus(report, 'dismissed') } },
    ]]
  }
  // Der Rückweg: versehentlich abgeschrieben. Eine Sperre nimmt er NICHT
  // zurück — die hebt der Betreiber in der Communities-Liste auf, dort steht
  // sie und dort gehört sie hin.
  return [[{ label: t('control.abuse.reopen'), icon: 'i-ph-arrow-counter-clockwise', onSelect: () => { void setStatus(report, 'open') } }]]
}

const STAT_KEYS = ['open', 'suspended', 'dismissed', 'total'] as const
</script>

<template>
  <UDashboardPanel id="abuse">
    <template #header>
      <UDashboardNavbar :title="t('control.abuse.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-arrows-clockwise"
            color="neutral"
            variant="ghost"
            :loading="status === 'pending'"
            :label="t('control.abuse.refresh')"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-4 text-sm text-muted">{{ t('control.abuse.subtitle') }}</p>

      <div v-if="stats" class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4" data-abuse-stats>
        <div v-for="key in STAT_KEYS" :key="key" class="rounded-lg border border-default p-3">
          <p class="text-2xl font-semibold">{{ stats[key] }}</p>
          <p class="text-xs text-muted">{{ t(`control.abuse.stats.${key}`) }}</p>
        </div>
      </div>

      <UTable :data="reports" :columns="columns" data-abuse-list>
        <template #host-cell="{ row }">
          <div class="min-w-0" :data-abuse-host="row.original.host">
            <p class="truncate font-medium">{{ row.original.communityName || row.original.host }}</p>
            <p class="truncate font-mono text-xs text-muted">{{ row.original.host }}</p>
            <!-- Kein Treffer im Register: Tippfehler, fremde Domain oder eine
                 Community, die es nicht mehr gibt. Die Meldung bleibt trotzdem
                 stehen — abweisen hieße, eine echte zu verlieren. -->
            <p v-if="!row.original.communityId" class="text-xs text-warning">{{ t('control.abuse.unmatched') }}</p>
          </div>
        </template>
        <template #category-cell="{ row }">
          <UBadge color="neutral" variant="subtle" size="sm">{{ t(`control.abuse.categories.${row.original.category}`) }}</UBadge>
        </template>
        <template #message-cell="{ row }">
          <div class="min-w-0 max-w-md">
            <p class="line-clamp-2 text-sm">{{ row.original.message }}</p>
            <a
              v-if="isDisplayableReportUrl(row.original.url)"
              :href="row.original.url"
              target="_blank"
              rel="noopener noreferrer"
              class="block truncate text-xs text-muted hover:underline"
              data-abuse-url-link
            >{{ row.original.url }}</a>
            <p
              v-else-if="row.original.url"
              class="truncate text-xs text-muted"
              data-abuse-url-text
              :title="t('control.abuse.urlNotLinked')"
            >{{ row.original.url }}</p>
          </div>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="row.original.status === 'open' ? 'warning' : row.original.status === 'suspended' ? 'error' : 'neutral'"
            variant="subtle"
            size="sm"
            :data-abuse-status="row.original.status"
          >
            {{ t(`control.abuse.stats.${row.original.status}`) }}
          </UBadge>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
              <UButton
                icon="i-ph-dots-three-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                :loading="busy === row.original.id"
                :aria-label="t('control.abuse.rowActions')"
              />
            </UDropdownMenu>
          </div>
        </template>

        <template #empty>
          <CoreEmptyState
            icon="i-ph-shield-check"
            :title="t('control.abuse.emptyTitle')"
            :description="t('control.abuse.empty')"
            data-abuse-empty
          />
        </template>
      </UTable>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="showSuspend" :title="t('control.abuse.suspend')">
    <template #body>
      <div class="space-y-3">
        <p class="text-sm text-muted">{{ t('control.abuse.suspendIntro', { host: suspendTarget?.host ?? '' }) }}</p>
        <UFormField :label="t('control.tenants.suspend.reasonLabel')" :help="t('control.tenants.suspend.reasonHelp')">
          <UTextarea v-model="suspendReason" :rows="3" class="w-full" data-abuse-reason autofocus />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="() => { showSuspend = false }" />
        <UButton
          color="error"
          :loading="suspendSaving"
          :disabled="suspendReason.trim().length < 5"
          data-abuse-suspend-save
          :label="t('control.abuse.suspend')"
          @click="submitSuspend"
        />
      </div>
    </template>
  </UModal>
</template>
