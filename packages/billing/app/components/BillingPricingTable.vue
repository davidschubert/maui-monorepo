<script setup lang="ts">
import type { BillingInterval } from '../../shared/types/billing'

/**
 * Pricing-Tabelle aus maui.billing.plans (§6: monatlich/jährlich-Umschalter).
 * CTA-Zustände: Gast → Login, free-Plan → „aktueller Stand", eigener Plan →
 * Portal, sonst → Checkout-Redirect.
 */
const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const { locale } = useI18n()
const { isLoggedIn } = useCurrentUser()
const { config, planId: currentPlanId, entitled } = useBilling()

const interval = ref<BillingInterval>('monthly')
const busyPlan = ref('')

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
    <div class="mb-6 flex justify-center gap-1">
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

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="plan in config.plans"
        :key="plan.id"
        class="flex flex-col rounded-xl border p-5"
        :class="plan.highlight ? 'border-primary shadow-sm' : 'border-default'"
        :data-plan="plan.id"
      >
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">{{ t(plan.labelKey) }}</h3>
          <UBadge v-if="plan.highlight" color="primary" variant="subtle" size="sm">
            {{ t('billing.pricing.popular') }}
          </UBadge>
        </div>

        <p class="mt-1 text-sm text-muted">{{ t(`${plan.labelKey}Description`) }}</p>

        <ul class="mt-4 flex-1 space-y-1.5 text-sm">
          <li v-for="feature in plan.features" :key="feature" class="flex items-center gap-2">
            <UIcon name="i-ph-check" class="size-4 shrink-0 text-success" />
            {{ t(`billing.features.${feature}`) }}
          </li>
          <li v-if="plan.features.length === 0" class="flex items-center gap-2 text-muted">
            <UIcon name="i-ph-check" class="size-4 shrink-0" />
            {{ t('billing.pricing.freeFeatures') }}
          </li>
        </ul>

        <div class="mt-5">
          <UButton
            v-if="!plan.lookupKeys"
            color="neutral" variant="outline" block disabled
          >
            {{ entitled ? t('billing.pricing.included') : t('billing.pricing.currentPlan') }}
          </UButton>
          <UButton
            v-else-if="!isLoggedIn"
            :to="localePath('/login')"
            color="primary" :variant="plan.highlight ? 'solid' : 'outline'" block
          >
            {{ t('billing.pricing.loginCta') }}
          </UButton>
          <UButton
            v-else-if="currentPlanId === plan.id"
            color="primary" variant="outline" block
            :loading="busyPlan === 'portal'"
            data-testid="plan-manage"
            @click="openPortal"
          >
            {{ t('billing.pricing.manage') }}
          </UButton>
          <UButton
            v-else
            color="primary" :variant="plan.highlight ? 'solid' : 'outline'" block
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
