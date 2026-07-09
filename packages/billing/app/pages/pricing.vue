<script setup lang="ts">
/**
 * Öffentliche Pricing-Seite (out-of-the-box, App-überschreibbar wie
 * core/login). Ohne aktiviertes Gate rendert sie den Hinweis-Zustand.
 */
const { t } = useI18n()
const { config } = useBilling()

useHead({ title: () => t('billing.pricing.title') })
</script>

<template>
  <UContainer class="max-w-5xl py-12">
    <div class="mb-10 text-center">
      <h1 class="text-4xl font-bold tracking-tight">{{ t('billing.pricing.title') }}</h1>
      <p class="mt-3 text-lg text-muted">{{ t('billing.pricing.subtitle') }}</p>
    </div>

    <template v-if="config.enabled">
      <BillingPricingTable />

      <section v-if="config.compare?.sections?.length" class="mt-24">
        <h2 class="mb-10 text-center text-3xl font-bold tracking-tight">
          {{ t('billing.pricing.compareTitle') }}
        </h2>
        <BillingCompareTable />
      </section>
    </template>
    <p v-else class="py-16 text-center text-sm text-muted" data-testid="billing-disabled">
      {{ t('billing.pricing.disabled') }}
    </p>
  </UContainer>
</template>
