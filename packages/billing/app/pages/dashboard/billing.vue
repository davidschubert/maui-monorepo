<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { BillingAdminSubscriptionRow } from '../../../shared/types/billing'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'billing.manage' })

/**
 * Admin-Abo-Übersicht — §6: read-only + Deep-Link zum Stripe-Customer
 * (Aktionen wie Refunds passieren im Stripe-Dashboard).
 */
const { t } = useI18n()
const { formatDate } = useFormatDate()
const { page, setPage } = usePagination()
const { config } = useBilling()

useHead({ title: () => t('billing.admin.title') })

// Nachschlagen statt Volltext: der Betreiber sucht das Abo EINES Kontos —
// über die Nutzer-ID oder die Stripe-Kunden-ID (beide indiziert).
const lookup = ref('')
const activeLookup = ref('')
const { sortField, sortDir, toggle } = useTableSort('$updatedAt', 'desc')

function runLookup() {
  activeLookup.value = lookup.value.trim()
  setPage(1)
}

const { data, status } = await useFetch<{ total: number, rows: BillingAdminSubscriptionRow[] }>('/api/billing/admin/subscriptions', {
  query: computed(() => ({ page: page.value, lookup: activeLookup.value, dir: sortDir.value })),
  lazy: true,
  server: false,
})

watch(sortDir, () => setPage(1))

const hasActiveFilter = computed(() => activeLookup.value !== '')
function resetFilters() {
  lookup.value = ''
  activeLookup.value = ''
  setPage(1)
}

const stripeCustomerUrl = (id: string) => `https://dashboard.stripe.com/test/customers/${id}`

/**
 * Interne Schlüssel raus aus dem Blick (Audit-Befund C12). Hier standen zwei
 * rohe Ids in der Tabelle:
 *
 *  - `planId` ist ein interner Key ('personal', 'pro', …). Die Plan-Deklaration
 *    trägt bereits einen `labelKey` — genau dafür ist er da. Fällt ein Plan aus
 *    der Konfiguration (Altbestand, umbenannter Key), zeigen wir den Key
 *    weiter, statt eine leere Zelle zu liefern.
 *  - `userId` ist eine 20-stellige Appwrite-Id. Sie bleibt sichtbar, weil sie
 *    der Schlüssel für die Nachschlage-Suche darüber ist — aber SEKUNDÄR, unter
 *    dem Namen und klein.
 */
function planLabel(planId: string): string {
  const plan = config.value.plans.find(p => p.id === planId)
  return plan ? t(plan.labelKey) : planId
}

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

// Sortiert wird nach $updatedAt — deshalb trägt genau DIESE Spalte die
// Pfeile, nicht „Verlängert am". Ein Pfeil an einer Spalte, die nicht die
// sortierte ist, wäre eine Lüge.
const columns = computed<TableColumn<BillingAdminSubscriptionRow>[]>(() => [
  { accessorKey: 'planId', header: () => t('billing.admin.col.plan') },
  { id: 'state', header: () => t('billing.admin.col.status') },
  { accessorKey: 'userId', header: () => t('billing.admin.col.user'), meta: { class: HIDE_MD } },
  { accessorKey: 'currentPeriodEnd', header: () => t('billing.admin.col.renews'), id: 'renews', meta: { class: HIDE_LG } },
  { accessorKey: '$updatedAt', header: () => t('billing.admin.col.updated'), id: 'updated' },
  { id: 'actions', header: () => '' },
])
</script>

<template>
  <UDashboardPanel id="billing-admin">
    <template #header>
      <UDashboardNavbar :title="`${t('billing.admin.title')} (${data?.total ?? 0})`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <ClientOnly>
        <template #fallback>
          <div class="flex justify-center py-16"><UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" /></div>
        </template>

        <UAlert
          v-if="!config.enabled"
          color="warning" variant="subtle" icon="i-ph-plugs"
          :title="t('billing.admin.disabled')"
          data-testid="billing-admin-disabled"
        />

        <div v-else-if="status === 'pending' && !data" class="flex justify-center py-16">
          <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
        </div>

        <template v-else>
          <form class="mb-4 flex max-w-md gap-2" @submit.prevent="runLookup">
            <UInput
              v-model="lookup"
              icon="i-ph-magnifying-glass"
              :placeholder="t('billing.admin.lookupPlaceholder')"
              class="flex-1 font-mono"
              data-billing-lookup
            />
            <UButton type="submit" color="neutral" variant="subtle">{{ t('billing.admin.lookup') }}</UButton>
          </form>

          <UTable :data="data?.rows ?? []" :columns="columns" data-testid="billing-admin-list">
            <template #updated-header>
              <SortableHeader :label="t('billing.admin.col.updated')" field="$updatedAt" :active="sortField" :dir="sortDir" @toggle="toggle" />
            </template>

            <template #planId-cell="{ row }">
              <span class="font-medium">{{ planLabel(row.original.planId) }}</span>
            </template>
            <template #state-cell="{ row }">
              <div class="flex flex-wrap items-center gap-1">
                <BillingPlanBadge :status="row.original.status" />
                <UBadge v-if="row.original.cancelAtPeriodEnd" color="warning" variant="outline" size="sm">
                  {{ t('billing.admin.cancelling') }}
                </UBadge>
              </div>
            </template>
            <template #userId-cell="{ row }">
              <div class="flex min-w-0 flex-col">
                <span class="truncate text-sm font-medium">{{ row.original.userName || t('billing.admin.unknownUser') }}</span>
                <span v-if="row.original.userEmail" class="truncate text-xs text-muted">{{ row.original.userEmail }}</span>
                <span class="truncate font-mono text-xs text-dimmed" :title="row.original.userId">{{ row.original.userId }}</span>
              </div>
            </template>
            <template #renews-cell="{ row }">
              <span class="whitespace-nowrap text-sm text-muted">{{ formatDate(row.original.currentPeriodEnd) }}</span>
            </template>
            <template #updated-cell="{ row }">
              <span class="whitespace-nowrap text-sm text-muted">{{ formatDate(row.original.$updatedAt) }}</span>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end">
                <UButton
                  :href="stripeCustomerUrl(row.original.stripeCustomerId)"
                  external target="_blank"
                  color="neutral" variant="ghost" size="xs" icon="i-ph-arrow-square-out"
                >
                  Stripe
                </UButton>
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
                icon="i-ph-credit-card"
                :title="t('billing.admin.emptyTitle')"
                :description="t('billing.admin.empty')"
                data-testid="billing-admin-empty"
              />
            </template>
          </UTable>

          <UPagination
            v-if="(data?.total ?? 0) > 50"
            class="mt-4"
            :page="page"
            :total="data?.total ?? 0"
            :items-per-page="50"
            @update:page="setPage"
          />
        </template>
      </ClientOnly>
    </template>
  </UDashboardPanel>
</template>
