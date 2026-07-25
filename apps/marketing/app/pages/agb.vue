<script setup lang="ts">
// AGB der Marketing-Domain (Entwurfsstruktur).
definePageMeta({ layout: 'site' })
defineI18nRoute({ paths: { en: '/terms', de: '/agb' } })
</script>

<template>
  <LegalPage scope="terms" :section-count="8" />
</template>
