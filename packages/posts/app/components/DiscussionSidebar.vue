<script setup lang="ts">
import type { DiscussionSidebarResponse } from '../../shared/types/post'

/**
 * Die dauerhafte Seitenleiste (Davids Entscheidung 7): meine letzten fünf
 * Kategorien — ohne eigene Aktivität die fünf größten — plus „Alle
 * Kategorien" als sechster Link.
 *
 * Die Überschrift folgt der Herkunft, die der Server mitliefert (`source`):
 * „Deine Kategorien" über einer Liste, mit der man nie zu tun hatte, wäre eine
 * Lüge, die niemand bemerkt und trotzdem jeder spürt.
 */
const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()

const { data } = await useFetch<DiscussionSidebarResponse>('/api/posts/discussions/sidebar')

const rows = computed(() => data.value?.rows ?? [])
const heading = computed(() => t(`posts.discussions.sidebar.${data.value?.source ?? 'largest'}`))

/** Aktive Kategorie hervorheben — der Pfad trägt sie als zweites Segment. */
const activeSlug = computed(() => {
  const param = route.params.category
  return typeof param === 'string' ? param : ''
})
</script>

<template>
  <nav v-if="rows.length > 0" class="space-y-1" data-discussions-sidebar>
    <p class="px-2 pb-1 text-xs font-semibold tracking-wide text-dimmed uppercase">{{ heading }}</p>
    <NuxtLink
      v-for="category in rows"
      :key="category.$id"
      :to="localePath(`/discussions/${category.slug}`)"
      class="block truncate rounded-md px-2 py-1.5 text-sm hover:bg-elevated"
      :class="activeSlug === category.slug ? 'bg-elevated font-medium text-default' : 'text-muted'"
    >
      {{ category.name }}
    </NuxtLink>
    <NuxtLink
      :to="localePath('/discussions?order=categories')"
      class="block rounded-md px-2 py-1.5 text-sm text-muted hover:bg-elevated"
    >
      {{ t('posts.discussions.allCategories') }}
    </NuxtLink>
  </nav>
</template>
