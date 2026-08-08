<script setup lang="ts">
// Produkt-Badge der Demo (P4, Davids Idee 2026-07-26; umgezogen aus
// apps/platform neben useTenantPlan — Layout-Konsolidierung S9): auf
// Demo-Hosts zeigt jedes Produkt, ab welchem Plan es enthalten ist — die
// Demo läuft auf dem höchsten Plan und wird so nebenbei zur Preisseite mit
// Beweis. Basic-Produkte tragen KEIN Badge (was frei ist, muss nicht
// erklärt werden). Außerhalb der Demo-Hosts rendert die Komponente nichts.
//
// `always` HEBT GENAU DIESE HOST-BEDINGUNG AUF (F51 Paket 2, 2026-08-07) —
// und nur sie; Text, Plan-Auflösung und die Basic-Regel bleiben dieselben.
// Gebraucht wird es vom Reiter „Produkte" im Community-Hub: dort fragt der
// OWNER nach seinem eigenen Tarif, und die Antwort „Ab Pro" ist keine Werbung
// an einen Besucher, sondern die Auskunft, nach der er gesucht hat. Der
// Default bleibt bewusst die Demo-Bedingung: ein Badge auf einer öffentlichen
// Kundenseite wäre Preiswerbung im fremden Wohnzimmer.
const props = defineProps<{ product: string, always?: boolean }>()

const appConfig = useAppConfig()
const host = useRequestURL().host
const isDemo = computed(() => {
  const hosts = (appConfig.pukalani as { demo?: { hosts?: string[] } }).demo?.hosts ?? []
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
    v-if="(always || isDemo) && label"
    color="primary"
    variant="subtle"
    size="sm"
  >
    {{ $t('demo.planBadge', { plan: label }) }}
  </UBadge>
</template>
