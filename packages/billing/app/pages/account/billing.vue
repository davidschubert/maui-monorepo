<script setup lang="ts">
/**
 * Eigene Abo-Verwaltung: Abo-Karte + Pricing darunter (Upgrade-Pfad).
 * Nach dem Checkout-Redirect (?checkout=success) zeigt die Karte
 * „wird bestätigt…", bis der Webhook die Row geschrieben hat (Realtime).
 */
definePageMeta({ middleware: ['auth'] })

const { t } = useI18n()
const route = useRoute()

useHead({ title: () => t('billing.account.title') })

const confirming = computed(() => route.query.checkout === 'success')
</script>

<template>
  <UContainer class="max-w-2xl py-10">
    <h1 class="text-2xl font-bold">{{ t('billing.account.title') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('billing.account.subtitle') }}</p>

    <BillingSubscriptionCard :confirming="confirming" class="mt-6" />
  </UContainer>
</template>
