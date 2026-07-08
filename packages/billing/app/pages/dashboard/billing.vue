<script setup lang="ts">
import type { BillingSubscriptionRow } from '../../../shared/types/billing'

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

const { data, status } = await useFetch<{ total: number, rows: BillingSubscriptionRow[] }>('/api/billing/admin/subscriptions', {
  query: computed(() => ({ page: page.value })),
  lazy: true,
  server: false,
})

const stripeCustomerUrl = (id: string) => `https://dashboard.stripe.com/test/customers/${id}`
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

        <p v-else-if="!data?.rows.length" class="py-16 text-center text-sm text-muted" data-testid="billing-admin-empty">
          {{ t('billing.admin.empty') }}
        </p>

        <ul v-else class="divide-y divide-default" data-testid="billing-admin-list">
          <li v-for="row in data.rows" :key="row.$id" class="flex items-center gap-3 py-3 text-sm">
            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-2 font-medium">
                {{ row.planId }}
                <BillingPlanBadge :status="row.status" />
                <UBadge v-if="row.cancelAtPeriodEnd" color="warning" variant="outline" size="sm">
                  {{ t('billing.admin.cancelling') }}
                </UBadge>
              </p>
              <p class="mt-0.5 text-xs text-muted">
                {{ t('billing.admin.user') }}: {{ row.userId }} · {{ t('billing.account.renewsAt', { date: formatDate(row.currentPeriodEnd) }) }}
              </p>
            </div>
            <UButton
              :href="stripeCustomerUrl(row.stripeCustomerId)"
              external target="_blank"
              color="neutral" variant="ghost" size="xs" icon="i-ph-arrow-square-out"
            >
              Stripe
            </UButton>
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
