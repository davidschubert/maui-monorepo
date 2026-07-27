<script setup lang="ts">
// Startseite = content/index.md (Sammlung `landing`). Kein Layout: Kopf und
// Fuß kommen aus app.vue, die Seitenleiste gehört nur den Inhaltsseiten.
definePageMeta({ layout: false })

const { data: page } = await useAsyncData('docs-landing', () => queryCollection('landing').path('/').first())
if (!page.value) {
  throw createError({ status: 404, statusText: 'Page not found', fatal: true })
}

const brand = useBrandName()

// Titel im Hausmuster „<Seite> · <Brand>" (useBrandTitle, Core). Die Startseite
// trägt den Site-Namen in ihrem Frontmatter schon selbst — dann bleibt der
// Seitenname leer, sonst stünde „Pukalani Hilfe · Pukalani Hilfe" im Tab.
const pageName = computed(() => {
  const title = page.value?.seo?.title || page.value?.title || ''
  return title === brand.value ? '' : title
})

useBrandTitle(pageName, {
  description: () => page.value?.seo?.description || page.value?.description,
})
</script>

<template>
  <ContentRenderer
    v-if="page"
    :value="page"
    :prose="false"
  />
</template>
