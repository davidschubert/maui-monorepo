<script setup lang="ts">
/** Studio-Editor: bestehendes Custom Theme bearbeiten (Row-ID in der Route). */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })

const route = useRoute()
const themeId = computed(() => String(route.params.id ?? ''))
</script>

<template>
  <StudioEditor :theme-id="themeId" />
</template>
