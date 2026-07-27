<script setup lang="ts">
import { findPageHeadline } from '@nuxt/content/utils'

definePageMeta({ layout: 'docs' })

const { t } = useI18n()
const route = useRoute()

const fallback = ref<DocsNavigation | null>(null)
const navigation = inject(docsNavigationKey, fallback)

// Der Abschnitt bestimmt die Sammlung — beide sind mit ihrem Pfad-Prefix
// indiziert, Route und Content-Pfad sind deshalb identisch (i18n: no_prefix).
const section = computed(() => resolveDocsSection(route.path))

const { data: page } = await useAsyncData(route.path, () =>
  queryCollection(section.value).path(route.path).first())
if (!page.value) {
  throw createError({ status: 404, statusText: 'Page not found', fatal: true })
}

const { data: surround } = await useAsyncData(`${route.path}-surround`, () =>
  queryCollectionItemSurroundings(section.value, route.path, { fields: ['description'] }))

const title = page.value.seo?.title || page.value.title
const description = page.value.seo?.description || page.value.description

useSeoMeta({
  title,
  ogTitle: title,
  description,
  ogDescription: description,
})

const headline = computed(() => findPageHeadline(
  docsSectionItems(navigation.value, section.value),
  page.value?.path,
))
</script>

<template>
  <UPage v-if="page">
    <UPageHeader
      :title="page.title"
      :description="page.description"
      :headline="headline"
    >
      <template #links>
        <UButton
          v-for="(link, index) in page.links"
          :key="index"
          v-bind="link"
        />
      </template>
    </UPageHeader>

    <UPageBody>
      <ContentRenderer :value="page" />

      <USeparator v-if="surround?.length" />

      <UContentSurround :surround="surround" />
    </UPageBody>

    <template
      v-if="page?.body?.toc?.links?.length"
      #right
    >
      <UContentToc
        :title="t('docs.toc')"
        :links="page.body?.toc?.links"
      />
    </template>
  </UPage>
</template>
