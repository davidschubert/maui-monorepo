<script setup lang="ts">
import type { SubscriptionStatus } from '../../shared/types/billing'

/** Status-Badge (Abo-Karte + Admin-Liste) — Farbe je Statusklasse. */
const props = defineProps<{ status: SubscriptionStatus }>()

const { t } = useI18n()

const color = computed(() => {
  if (props.status === 'active' || props.status === 'trialing') return 'success' as const
  if (props.status === 'past_due' || props.status === 'incomplete' || props.status === 'paused') return 'warning' as const
  return 'neutral' as const
})
</script>

<template>
  <UBadge :color="color" variant="subtle" size="sm" data-testid="billing-status">
    {{ t(`billing.status.${status}`) }}
  </UBadge>
</template>
