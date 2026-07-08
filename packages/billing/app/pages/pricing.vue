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
  <UContainer class="max-w-4xl py-10">
    <div class="mb-8 text-center">
      <h1 class="text-3xl font-bold">{{ t('billing.pricing.title') }}</h1>
      <p class="mt-2 text-muted">{{ t('billing.pricing.subtitle') }}</p>
    </div>

    <BillingPricingTable v-if="config.enabled" />
    <p v-else class="py-16 text-center text-sm text-muted" data-testid="billing-disabled">
      {{ t('billing.pricing.disabled') }}
    </p>
  </UContainer>
</template>
