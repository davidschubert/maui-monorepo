<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { CategoryListResponse, CategoryWithCount } from '../../shared/types/post'

/**
 * Die Kategorien-Ansicht (Sortierung „Categories" aus dem Konzept): eine
 * eigene Tabelle mit Kategorie (Name + Beschreibung) und der Anzahl ihrer
 * Themen.
 *
 * DIE SUCHE HIER IST CLIENT-SEITIG, und das ist eine Entscheidung: es sind
 * höchstens hundert Zeilen, sie liegen bereits vollständig im Speicher, und
 * eine Server-Runde je Tastendruck für ein `includes()` wäre Aufwand ohne
 * Gegenwert. Die TOPIC-Suche läuft dagegen über den Server — dort ist der
 * Bestand unbegrenzt.
 */
const { t } = useI18n()
const localePath = useLocalePath()

const { data, status } = await useFetch<CategoryListResponse>('/api/posts/categories', {
  query: { counts: '1' },
})

const search = ref('')
const rows = computed(() => {
  const all = data.value?.rows ?? []
  const needle = search.value.trim().toLowerCase()
  if (!needle) return all
  return all.filter(entry =>
    entry.category.name.toLowerCase().includes(needle)
    || entry.category.description.toLowerCase().includes(needle))
})

const columns = computed<TableColumn<CategoryWithCount>[]>(() => [
  { id: 'category', header: () => t('posts.discussions.col.category') },
  { id: 'topics', header: () => t('posts.discussions.col.topics') },
])
</script>

<template>
  <div class="space-y-4">
    <UInput
      v-model="search"
      icon="i-ph-magnifying-glass"
      size="sm"
      :placeholder="t('posts.discussions.searchCategories')"
      class="max-w-56"
      data-categories-search
    />

    <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
      <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
    </div>

    <UTable v-else :data="rows" :columns="columns" data-discussion-categories>
      <template #category-cell="{ row }">
        <div class="max-w-lg">
          <NuxtLink
            :to="localePath(`/discussions/${row.original.category.slug}`)"
            class="font-medium text-default hover:text-primary hover:underline"
          >
            {{ row.original.category.name }}
          </NuxtLink>
          <p v-if="row.original.category.description" class="text-sm text-muted">
            {{ row.original.category.description }}
          </p>
        </div>
      </template>

      <template #topics-cell="{ row }">
        <span class="text-sm tabular-nums text-muted">{{ formatCount(row.original.topicCount) }}</span>
      </template>

      <template #empty>
        <CoreEmptyState
          v-if="search.trim()"
          icon="i-ph-magnifying-glass"
          :title="t('posts.discussions.noResultsTitle')"
          :description="t('posts.discussions.noResultsText')"
          :action-label="t('posts.discussions.resetSearch')"
          action-icon="i-ph-arrow-counter-clockwise"
          @action="() => { search = '' }"
        />
        <CoreEmptyState
          v-else
          icon="i-ph-folders"
          :title="t('posts.discussions.emptyCategoriesTitle')"
          :description="t('posts.discussions.emptyCategoriesText')"
        />
      </template>
    </UTable>
  </div>
</template>
