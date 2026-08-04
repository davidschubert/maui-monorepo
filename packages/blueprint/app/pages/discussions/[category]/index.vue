<script setup lang="ts">
import type { CategoryListResponse } from '../../../../../posts/shared/types/post'

/**
 * BAUPLAN-Komposition: eine Kategorie (F1 Stufe 1).
 *
 * DIESE SEITE IST DER EINE LINK, DER SICH NICHT SELBST HEILEN KANN — sie trägt
 * keine Row-Id, nur den Slug. Genau deshalb ist der Kategorie-Slug nach der
 * Anlage fest (pages-Muster); ein unbekannter Slug ist hier folgerichtig ein
 * 404 und keine leere Liste: eine leere Liste behauptete, es gäbe die
 * Kategorie und sie sei nur leer.
 *
 * Die Kategorien-Liste ist derselbe `useFetch`-Aufruf wie in der Seitenleiste
 * und der Kategorien-Ansicht — gleicher Schlüssel, EIN Request, geteilter
 * SSR-Payload.
 */
const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()

const slug = computed(() => String(route.params.category ?? ''))

const { data } = await useFetch<CategoryListResponse>('/api/posts/categories', {
  query: { all: '1' },
})
const category = computed(() => data.value?.rows.find(entry => entry.category.slug === slug.value)?.category ?? null)

if (!category.value) {
  throw createError({ status: 404, statusText: 'Category not found' })
}

useBrandTitle(() => category.value?.name ?? t('posts.discussions.title'), {
  description: () => category.value?.description || t('posts.discussions.description'),
})

const { replyCounts, loadCounts } = useDiscussionReplyCounts()
</script>

<template>
  <UContainer class="max-w-5xl py-8">
    <UButton
      :to="localePath('/discussions')"
      icon="i-ph-arrow-left"
      color="neutral"
      variant="ghost"
      size="xs"
      class="-ms-2 mb-2"
    >
      {{ t('posts.discussions.title') }}
    </UButton>

    <h1 class="text-2xl font-bold">{{ category?.name }}</h1>
    <p v-if="category?.description" class="mt-1 text-sm text-muted">{{ category.description }}</p>

    <div class="mt-6 flex flex-col gap-6 md:flex-row">
      <aside class="md:w-48 md:shrink-0">
        <DiscussionSidebar />
        <DiscussionSidebarLinks />
      </aside>

      <div class="min-w-0 flex-1">
        <DiscussionTopics
          :category-slug="slug"
          :reply-counts="replyCounts"
          @rows-changed="loadCounts"
        />
      </div>
    </div>
  </UContainer>
</template>
