<script setup lang="ts">
import type { BillingInterval, BillingPricesResponse } from '../../shared/types/billing'

/**
 * Pricing-Karten aus maui.billing.plans (§6: monatlich/jährlich-Umschalter).
 * Bei zwei Plänen bewusst groß und zentriert (50/50); ab drei Plänen dreispaltig.
 * Beträge kommen live aus Stripe (GET /api/billing/prices, gecacht) — ohne
 * konfiguriertes Stripe rendert die Karte ohne Betrag statt kaputt.
 * CTA-Zustände: Gast → Login, free-Plan → „aktueller Stand", eigener Plan →
 * Portal, sonst → Checkout-Redirect.
 */
const { t, locale } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const { isLoggedIn } = useCurrentUser()
const { config, planId: currentPlanId, entitled } = useBilling()

const interval = ref<BillingInterval>('monthly')
const busyPlan = ref('')

const { data: priceData } = useFetch<BillingPricesResponse>('/api/billing/prices', {
  key: 'billing:prices',
  immediate: config.value.enabled,
  ignoreResponseError: true,
  default: () => ({ prices: null }),
})

/** Betrag in Cent → lokalisierte Anzeige („9 €" statt „9,00 €" bei glatten Beträgen) */
function formatAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat(locale.value === 'de' ? 'de-DE' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100)
}

function planPrice(planId: string, lookupKeys: unknown): string | null {
  // free (ohne Stripe-Objekt) zeigt immer 0 in der Config-Währung
  if (!lookupKeys) return formatAmount(0, config.value.currency)
  const entry = priceData.value?.prices?.[planId]?.[interval.value]
  return entry ? formatAmount(entry.amount, entry.currency) : null
}

async function choosePlan(planId: string) {
  busyPlan.value = planId
  try {
    const res = await $fetch<{ url: string }>('/api/billing/checkout', {
      method: 'POST',
      query: locale.value === 'de' ? { locale: 'de' } : {},
      body: { planId, interval: interval.value },
    })
    window.location.href = res.url
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    toast.add({
      title: statusCode === 409 ? t('billing.pricing.alreadyActive') : t('billing.pricing.checkoutFailed'),
      color: 'error',
    })
  }
  finally {
    busyPlan.value = ''
  }
}

async function openPortal() {
  busyPlan.value = 'portal'
  try {
    const res = await $fetch<{ url: string }>('/api/billing/portal', {
      method: 'POST',
      query: locale.value === 'de' ? { locale: 'de' } : {},
    })
    window.location.href = res.url
  }
  catch {
    toast.add({ title: t('billing.pricing.checkoutFailed'), color: 'error' })
  }
  finally {
    busyPlan.value = ''
  }
}
</script>

<template>
  <div v-if="config.enabled" data-testid="pricing-table">
    <div class="mb-8 flex justify-center gap-1">
      <UButton
        :color="interval === 'monthly' ? 'primary' : 'neutral'"
        :variant="interval === 'monthly' ? 'soft' : 'ghost'"
        size="sm"
        data-testid="interval-monthly"
        @click="interval = 'monthly'"
      >
        {{ t('billing.pricing.monthly') }}
      </UButton>
      <UButton
        :color="interval === 'yearly' ? 'primary' : 'neutral'"
        :variant="interval === 'yearly' ? 'soft' : 'ghost'"
        size="sm"
        data-testid="interval-yearly"
        @click="interval = 'yearly'"
      >
        {{ t('billing.pricing.yearly') }}
      </UButton>
    </div>

    <div
      class="mx-auto grid grid-cols-1 gap-6"
      :class="config.plans.length > 2 ? 'max-w-6xl md:grid-cols-2 lg:grid-cols-3' : 'max-w-4xl md:grid-cols-2'"
    >
      <div
        v-for="plan in config.plans"
        :key="plan.id"
        class="flex flex-col rounded-2xl border p-8"
        :class="plan.highlight ? 'border-primary shadow-sm' : 'border-default'"
        :data-plan="plan.id"
      >
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-semibold">{{ t(plan.labelKey) }}</h3>
          <UBadge v-if="plan.highlight" color="primary" variant="subtle" size="sm">
            {{ t('billing.pricing.popular') }}
          </UBadge>
        </div>

        <p class="mt-4 flex items-baseline gap-1.5" :data-plan-price="plan.id">
          <span class="text-4xl font-bold tracking-tight">{{ planPrice(plan.id, plan.lookupKeys) ?? '—' }}</span>
          <span class="text-sm text-muted">{{ interval === 'monthly' ? t('billing.pricing.perMonth') : t('billing.pricing.perYear') }}</span>
        </p>

        <p class="mt-3 text-muted">{{ t(`${plan.labelKey}Description`) }}</p>

        <ul class="mt-6 flex-1 space-y-2.5 text-sm">
          <li v-for="feature in plan.highlights ?? plan.features" :key="feature" class="flex items-start gap-2.5">
            <UIcon name="i-ph-check" class="mt-0.5 size-4 shrink-0 text-success" />
            {{ t(`billing.features.${feature}`) }}
          </li>
          <li v-if="(plan.highlights ?? plan.features).length === 0" class="flex items-center gap-2.5 text-muted">
            <UIcon name="i-ph-check" class="size-4 shrink-0" />
            {{ t('billing.pricing.freeFeatures') }}
          </li>
        </ul>

        <div class="mt-8">
          <UButton
            v-if="!plan.lookupKeys"
            color="neutral" variant="outline" size="lg" block disabled
          >
            {{ entitled ? t('billing.pricing.included') : t('billing.pricing.currentPlan') }}
          </UButton>
          <UButton
            v-else-if="!isLoggedIn"
            :to="localePath('/login')"
            color="primary" :variant="plan.highlight ? 'solid' : 'outline'" size="lg" block
          >
            {{ t('billing.pricing.loginCta') }}
          </UButton>
          <UButton
            v-else-if="currentPlanId === plan.id"
            color="primary" variant="outline" size="lg" block
            :loading="busyPlan === 'portal'"
            data-testid="plan-manage"
            @click="openPortal"
          >
            {{ t('billing.pricing.manage') }}
          </UButton>
          <UButton
            v-else
            color="primary" :variant="plan.highlight ? 'solid' : 'outline'" size="lg" block
            :loading="busyPlan === plan.id"
            :data-plan-cta="plan.id"
            @click="choosePlan(plan.id)"
          >
            {{ t('billing.pricing.choose') }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
