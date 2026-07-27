<script setup lang="ts">
// Startseite = content/index.md (Sammlung `landing`). Kein Layout: Kopf und
// Fuß kommen aus app.vue, die Seitenleiste gehört nur den Inhaltsseiten.
definePageMeta({ layout: false })

const { data: page } = await useAsyncData('docs-landing', () => queryCollection('landing').path('/').first())
if (!page.value) {
  throw createError({ status: 404, statusText: 'Page not found', fatal: true })
}

const title = page.value.seo?.title || page.value.title
const description = page.value.seo?.description || page.value.description

useSeoMeta({
  // Startseite trägt den Site-Namen schon selbst — die Vorlage aus app.vue
  // würde ihn sonst doppeln.
  titleTemplate: '',
  title,
  ogTitle: title,
  description,
  ogDescription: description,
})
</script>

<template>
  <ContentRenderer
    v-if="page"
    :value="page"
    :prose="false"
  />
</template>
