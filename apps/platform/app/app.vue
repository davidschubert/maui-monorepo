<script setup lang="ts">
// Dünne App: nur Komposition + Branding — Logik lebt in den Layern.

// SEO-Kopf (hreflang-Alternates, canonical, og:url/og:locale, lang/dir) aus
// dem Core. Hier gilt zusätzlich maui.seo.originFromRequest: JEDER Mandanten-
// Host kanonisiert auf sich selbst (Audit-Befund B1).
useLocaleSeoHead()
</script>

<template>
  <UApp>
    <!-- Demo-Banner lebt im default-LAYOUT (P3) — Auth-Seiten bleiben frei. -->
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
