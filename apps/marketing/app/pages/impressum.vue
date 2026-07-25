<script setup lang="ts">
// Impressumspflicht (§ 5 DDG): auf der Marketing-Domain SELBST erreichbar —
// ein Link auf app.pukalani.app wäre bei eigenständiger Domain angreifbar.
// Struktur steht, verbindliche Texte kommen von David/Rechtsberatung (Entwurf).
definePageMeta({ layout: 'site' })
defineI18nRoute({ paths: { en: '/imprint', de: '/impressum' } })
</script>

<template>
  <LegalPage scope="imprint" :section-count="6" />
</template>
