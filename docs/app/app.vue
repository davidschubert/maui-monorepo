<script setup lang="ts">
// Die Doku ist deutsch — ohne diese Locale beschriftet Nuxt UI seine eigenen
// Bausteine englisch („Search…", „Type a command or search…", „Theme"), und
// genau die trägt die Suche (C8).
import { de } from '@nuxt/ui/locale'

const { seo } = useAppConfig()

const { data: navigation } = await useAsyncData('navigation', () => queryCollectionNavigation('docs'))

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' },
  ],
  htmlAttrs: {
    lang: 'de',
  },
})

useSeoMeta({
  titleTemplate: `%s - ${seo?.siteName}`,
  ogSiteName: seo?.siteName,
})

provide('navigation', navigation)
</script>

<template>
  <UApp :locale="de">
    <NuxtLoadingIndicator />

    <AppHeader />

    <UMain>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UMain>

    <AppFooter />

    <AppSearch />
  </UApp>
</template>
