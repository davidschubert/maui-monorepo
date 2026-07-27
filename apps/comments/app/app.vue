<script setup lang="ts">
// Dünne App: nur Komposition + Branding, Logik lebt in den Layern.
// Theme-/Sprach-Steuerung sitzt im DisplaySettingsMenu jedes Layouts
// (Default-Header, Auth-Ecke, Dashboard-Sidebar) — kein Floating-Widget mehr.

// SEO-Zweisprachigkeit (OPEN-ITEMS-Caveat zu redirectOn:'all'): hreflang-
// Alternates + og:locale + canonical auf JEDER Seite — Crawler finden beide
// Sprachvarianten, obwohl Besucher per Cookie umgeleitet werden. Absolute
// URLs kommen aus i18n.baseUrl (NUXT_PUBLIC_I18N_BASE_URL) — Single-Host-App.
useLocaleSeoHead()
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
