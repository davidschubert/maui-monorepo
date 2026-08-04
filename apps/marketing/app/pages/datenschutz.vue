<script setup lang="ts">
// Verbindliche Datenschutzerklärung der Marketing-Domain. Die TECHNISCHE
// Erklärseite (/dsgvo) ist bewusst etwas anderes und wird von hier verlinkt.
//
// NEUN Abschnitte seit 2026-08-04: „Reichweitenmessung" kam dazu, weil DIESE
// Seite selbst mit Plausible misst (app/app.config.ts, `pukalani.analytics`).
// Ein Dienst, der auf der Seite läuft und in ihrer eigenen Erklärung nicht
// vorkommt, ist die Lücke, die man später niemandem erklären kann — auch wenn
// der Rest der Seite noch Entwurf ist.
definePageMeta({ layout: 'site' })
defineI18nRoute({ paths: { en: '/privacy', de: '/datenschutz' } })
</script>

<template>
  <LegalPage scope="privacy" :section-count="9" />
</template>
