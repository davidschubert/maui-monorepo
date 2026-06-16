<script setup lang="ts">
// Dünne App: nur Komposition + Branding, Logik lebt in den Layern
const route = useRoute()
// Im Dashboard sitzt der Theme-/Appearance-Switcher im Sidebar-UserMenu —
// dort kein zusätzliches Floating-Widget (würde die Sidebar überlagern).
const showThemeSwitcher = computed(() => !/(^|\/)dashboard(\/|$)/.test(route.path))
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
