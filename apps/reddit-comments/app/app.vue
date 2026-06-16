<script setup lang="ts">
// Dünne App: nur Komposition + Branding, Logik lebt in den Layern.
// Theme-/Sprach-Steuerung sitzt im DisplaySettingsMenu jedes Layouts
// (Default-Header, Auth-Ecke, Dashboard-Sidebar) — kein Floating-Widget mehr.
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
