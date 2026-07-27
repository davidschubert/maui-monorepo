<script setup lang="ts">
// Dünne App: nur Komposition + Branding — Logik lebt in den Layern.

// SEO: hreflang-Alternates + og:locale + canonical (Core-Composable;
// absolute URLs via NUXT_PUBLIC_I18N_BASE_URL — der studio-Alias kanonisiert
// bewusst auf den control-Host).
useLocaleSeoHead()
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
