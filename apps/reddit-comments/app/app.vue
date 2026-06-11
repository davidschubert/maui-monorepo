<script setup lang="ts">
// Dünne App: nur Komposition + Branding, Logik lebt in den Layern
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <!-- Theme-Umschalter aus packages/themes — global, ohne Layout-Override -->
    <ThemeSwitcher class="fixed bottom-4 left-4 z-40" />
  </UApp>
</template>
