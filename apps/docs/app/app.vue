<script setup lang="ts">
// Dünne App: Kopf/Fuß + die beiden Content-Sammlungen. Inhalt lebt in content/.
const { t } = useI18n()

const { data: navigation } = await useAsyncData('docs-navigation', async () => {
  const [anleitung, entwickler] = await Promise.all([
    queryCollectionNavigation('anleitung'),
    queryCollectionNavigation('entwickler'),
  ])
  return { anleitung, entwickler } satisfies DocsNavigation
})

// Volltextsuche über BEIDE Sammlungen (client-only, wie im Nuxt-UI-Vorbild)
const { data: searchFiles } = useLazyAsyncData('docs-search', async () => {
  const [anleitung, entwickler] = await Promise.all([
    queryCollectionSearchSections('anleitung'),
    queryCollectionSearchSections('entwickler'),
  ])
  return [...anleitung, ...entwickler]
}, { server: false })

const searchNavigation = computed(() => [
  ...(navigation.value?.anleitung ?? []),
  ...(navigation.value?.entwickler ?? []),
])

provide(docsNavigationKey, navigation)

const localeHead = useLocaleHead({ seo: true, lang: true, dir: true })
useHead(() => ({
  htmlAttrs: localeHead.value.htmlAttrs,
  link: localeHead.value.link,
  meta: localeHead.value.meta,
  titleTemplate: (title?: string) => (title ? `${title} — ${t('docs.siteName')}` : t('docs.siteName')),
}))

useSeoMeta({
  ogSiteName: () => t('docs.siteName'),
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <DocsHeader />

    <UMain>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UMain>

    <DocsFooter />

    <ClientOnly>
      <LazyUContentSearch
        :files="searchFiles"
        :navigation="searchNavigation"
        :placeholder="t('docs.search.placeholder')"
      />
    </ClientOnly>
  </UApp>
</template>
