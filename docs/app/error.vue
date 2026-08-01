<script setup lang="ts">
import type { NuxtError } from '#app'
// Gleiche Locale wie in app.vue — die Fehlerseite trägt dieselbe Suche.
import { de } from '@nuxt/ui/locale'

defineProps<{
  error: NuxtError
}>()

useHead({
  htmlAttrs: {
    lang: 'de',
  },
})

useSeoMeta({
  title: 'Seite nicht gefunden',
  description: 'Diese Seite existiert nicht (mehr).',
})

const { data: navigation } = await useAsyncData('navigation', () => queryCollectionNavigation('docs'))

provide('navigation', navigation)
</script>

<template>
  <UApp :locale="de">
    <AppHeader />

    <UError :error="error" />

    <AppFooter />

    <AppSearch />
  </UApp>
</template>
