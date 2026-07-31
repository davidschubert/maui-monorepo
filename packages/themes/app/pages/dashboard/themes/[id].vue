<script setup lang="ts">
/** Theme-Editor: bestehendes Custom Theme bearbeiten (Row-ID in der Route). */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })

const route = useRoute()
const themeId = computed(() => String(route.params.id ?? ''))
</script>

<template>
  <CustomizeEditor :theme-id="themeId" />
</template>
