<script setup lang="ts">
// Dünne App: Komposition + globales SEO-Head (Core-Composable; absolute URLs
// via NUXT_PUBLIC_I18N_BASE_URL — Single-Host-App). Inhalt lebt in den Sektionen.
useLocaleSeoHead()
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
