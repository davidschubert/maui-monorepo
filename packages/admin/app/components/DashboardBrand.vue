<script setup lang="ts">
// Sidebar-Header — ersetzt den TeamsMenu/Org-Switcher des Templates durch das
// Branding der App. Der Name kommt aus pukalani.brand.name (core), NICHT mehr fest
// verdrahtet: dieser Layer läuft auch im Dashboard jeder Kunden-Community, und
// dort stand bis 2026-07-26 der Firmenname des Betreibers.
defineProps<{ collapsed?: boolean }>()

const localePath = useLocalePath()
const appConfig = useAppConfig() as { pukalani?: { brand?: { name?: string } } }
const brandName = computed(() => appConfig.pukalani?.brand?.name || 'Pukalani')
</script>

<template>
  <ULink :to="localePath('/dashboard')" class="flex items-center gap-2 px-1.5 py-1 font-bold tracking-tight text-default">
    <UIcon name="i-ph-island" class="size-6 shrink-0 text-primary" />
    <span v-if="!collapsed">{{ brandName }}</span>
  </ULink>
</template>
