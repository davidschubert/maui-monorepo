<script setup lang="ts">
// Demo-Page Phase 2: rendert einen UButton mit dem gemergten Theme.
// Der SSR-Log unten macht den app.config-Merge (App > Core) im Dev-Modus sichtbar.
const appConfig = useAppConfig()

if (import.meta.server) {
  console.log('[theme-check] useAppConfig().ui.colors:', JSON.stringify(appConfig.ui.colors, null, 2))
}
</script>

<template>
  <main class="p-8 space-y-4">
    <h1 class="text-2xl font-bold">Theme Check</h1>
    <UButton color="primary" size="lg">THEME-CHECK</UButton>
    <pre data-testid="app-config-dump">{{ JSON.stringify(appConfig.ui.colors, null, 2) }}</pre>
  </main>
</template>
