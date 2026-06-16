<script setup lang="ts">
// Sidebar-Header — ersetzt den TeamsMenu/Org-Switcher des Templates durch das Maui-Branding
defineProps<{ collapsed?: boolean }>()

const localePath = useLocalePath()
</script>

<template>
  <ULink :to="localePath('/dashboard')" class="flex items-center gap-2 px-1.5 py-1 font-bold tracking-tight text-default">
    <UIcon name="i-ph-island" class="size-6 shrink-0 text-primary" />
    <span v-if="!collapsed">Maui</span>
  </ULink>
</template>
