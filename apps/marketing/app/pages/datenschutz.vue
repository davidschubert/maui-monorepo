<script setup lang="ts">
// Verbindliche Datenschutzerklärung der Marketing-Domain. Die TECHNISCHE
// Erklärseite (/dsgvo) ist bewusst etwas anderes und wird von hier verlinkt.
definePageMeta({ layout: 'site' })
defineI18nRoute({ paths: { en: '/privacy', de: '/datenschutz' } })
</script>

<template>
  <LegalPage scope="privacy" :section-count="8" />
</template>
