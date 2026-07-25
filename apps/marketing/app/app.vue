<script setup lang="ts">
// Dünne App: Komposition + globales SEO-Head. Inhalt lebt in den Sektionen.
const localeHead = useLocaleHead({ seo: true, lang: true, dir: true })
useHead(() => ({
  htmlAttrs: localeHead.value.htmlAttrs,
  link: localeHead.value.link,
  meta: localeHead.value.meta,
}))
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
