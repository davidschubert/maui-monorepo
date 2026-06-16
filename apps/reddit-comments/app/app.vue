<script setup lang="ts">
// Dünne App: nur Komposition + Branding, Logik lebt in den Layern
const route = useRoute()
// Theme-Steuerung: Default-Layout über DisplaySettingsMenu im Header, Dashboard
// über das Sidebar-Menü. Das Floating-Widget bleibt nur auf den Auth-Seiten,
// die kein Header-Layout haben.
const showThemeSwitcher = computed(() => route.meta.layout === 'auth')
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <!-- Theme-Umschalter aus packages/themes — global, außer im Dashboard -->
    <ThemeSwitcher v-if="showThemeSwitcher" class="fixed bottom-4 left-4 z-40" />
  </UApp>
</template>
