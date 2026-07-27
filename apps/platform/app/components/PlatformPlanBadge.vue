<script setup lang="ts">
// Produkt-Badge der Demo (P4, Davids Idee 2026-07-26): auf Demo-Hosts zeigt
// jedes Produkt, ab welchem Plan es enthalten ist — die Demo läuft auf dem
// höchsten Plan und wird so nebenbei zur Preisseite mit Beweis. Basic-
// Produkte tragen KEIN Badge (was frei ist, muss nicht erklärt werden).
// Außerhalb der Demo-Hosts rendert die Komponente nichts.
const props = defineProps<{ product: string }>()

const appConfig = useAppConfig()
const host = useRequestURL().host
const isDemo = computed(() => {
  const hosts = (appConfig.maui as { demo?: { hosts?: string[] } }).demo?.hosts ?? []
  return hosts.includes(host)
})

const { minPlanFor } = useTenantPlan()
const minPlan = computed(() => minPlanFor(props.product))
const label = computed(() => {
  if (!minPlan.value) return null
  return minPlan.value.charAt(0).toUpperCase() + minPlan.value.slice(1)
})
</script>

<template>
  <UBadge
    v-if="isDemo && label"
    color="primary"
    variant="subtle"
    size="sm"
  >
    {{ $t('demo.planBadge', { plan: label }) }}
  </UBadge>
</template>
