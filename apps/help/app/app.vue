<script setup lang="ts">
import type { DocsNavigation } from '../shared/types/docs'

// Dünne App: Kopf/Fuß + die beiden Content-Sammlungen. Inhalt lebt in content/.
const { t } = useI18n()
const brand = useBrandName()

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

// SEO-Kopf: EIN Core-Aufruf (lang/dir, canonical, og:url/og:locale) statt der
// handgebauten useLocaleHead/useHead-Kopie — Audit-Befund B1. Single-Host-App,
// also bleibt das Gate `maui.seo.originFromRequest` aus und die absolute Basis
// kommt aus NUXT_PUBLIC_I18N_BASE_URL. Wegen der i18n-Strategie `no_prefix`
// (Begründung in nuxt.config.ts) entfallen hier hreflang-Alternates.
useLocaleSeoHead()

// KEIN eigenes titleTemplate mehr: den Titel setzen die Seiten selbst über
// useBrandTitle() im Hausmuster „<Seite> · <Brand>" (Audit-Befund S8).
useSeoMeta({
  ogSiteName: () => brand.value,
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
