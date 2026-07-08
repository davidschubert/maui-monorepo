<script setup lang="ts">
/**
 * Abo-Karte (account/billing): Plan, Status, Periodenende, Kündigungs-Hinweis,
 * Portal-Button. „Wird bestätigt…"-Zustand nach dem Checkout-Redirect, bis
 * Realtime/Refresh die Row liefert.
 */
const props = defineProps<{ confirming?: boolean }>()

const { t, locale } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const { formatDate } = useFormatDate()
const { config, subscription, planId } = useBilling()

const planLabelKey = computed(() => {
  const plan = config.value.plans.find(p => p.id === planId.value)
  return plan?.labelKey ?? 'billing.plans.free'
})

const busy = ref(false)
async function openPortal() {
  busy.value = true
  try {
    const res = await $fetch<{ url: string }>('/api/billing/portal', {
      method: 'POST',
      query: locale.value === 'de' ? { locale: 'de' } : {},
    })
    window.location.href = res.url
  }
  catch {
    toast.add({ title: t('billing.account.portalFailed'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="rounded-xl border border-default p-5" data-testid="subscription-card">
    <template v-if="props.confirming && !subscription">
      <div class="flex items-center gap-3">
        <UIcon name="i-ph-spinner" class="size-5 animate-spin text-primary" />
        <div>
          <p class="font-medium">{{ t('billing.account.confirmingTitle') }}</p>
          <p class="text-sm text-muted">{{ t('billing.account.confirmingText') }}</p>
        </div>
      </div>
    </template>

    <template v-else-if="subscription">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="flex items-center gap-2 font-semibold">
            {{ t(planLabelKey) }}
            <BillingPlanBadge :status="subscription.status" />
          </p>
          <p class="mt-1 text-sm text-muted" data-testid="period-end">
            {{ subscription.cancelAtPeriodEnd
              ? t('billing.account.endsAt', { date: formatDate(subscription.currentPeriodEnd) })
              : t('billing.account.renewsAt', { date: formatDate(subscription.currentPeriodEnd) }) }}
          </p>
          <p v-if="subscription.status === 'past_due'" class="mt-1 text-sm text-warning">
            {{ t('billing.account.pastDueHint') }}
          </p>
        </div>
        <UButton color="neutral" variant="outline" icon="i-ph-gear" :loading="busy" data-testid="portal-button" @click="openPortal">
          {{ t('billing.account.manage') }}
        </UButton>
      </div>
    </template>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="font-semibold">{{ t('billing.plans.free') }}</p>
          <p class="mt-1 text-sm text-muted">{{ t('billing.account.freeText') }}</p>
        </div>
        <UButton :to="localePath('/pricing')" color="primary" icon="i-ph-rocket-launch">
          {{ t('billing.account.upgrade') }}
        </UButton>
      </div>
    </template>
  </div>
</template>
