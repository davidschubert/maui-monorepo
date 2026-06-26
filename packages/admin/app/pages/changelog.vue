<script setup lang="ts">
// Öffentliche Changelog-Seite: unsere kuratierten, zweisprachigen Einträge im
// Nuxt-UI-ChangelogVersions-Layout (Timeline). Kein Auth.
import type { ChangelogEntry, ChangelogListResponse } from '../../shared/types/admin'

const { t, locale } = useI18n()

const LIMIT = 20
const page = ref(1)
const entries = ref<ChangelogEntry[]>([])
const total = ref(0)
const pending = ref(false)

const { data } = await useFetch<ChangelogListResponse>('/api/changelog', {
  query: { page: 1, limit: LIMIT },
})
entries.value = data.value?.entries ?? []
total.value = data.value?.total ?? 0

const hasMore = computed(() => entries.value.length < total.value)

async function loadMore() {
  if (pending.value || !hasMore.value) return
  pending.value = true
  page.value += 1
  try {
    const res = await $fetch<ChangelogListResponse>('/api/changelog', { query: { page: page.value, limit: LIMIT } })
    entries.value.push(...res.entries)
    total.value = res.total
  }
  catch {
    page.value -= 1 // Fehlschlag → Seite zurückdrehen, Button bleibt aktiv
  }
  finally {
    pending.value = false
  }
}

// Anzeige je UI-Sprache mit Fallback auf die jeweils andere
function localized(entry: ChangelogEntry, field: 'title' | 'body') {
  const en = field === 'title' ? entry.titleEn : entry.bodyEn
  const de = field === 'title' ? entry.title : entry.body
  return locale.value === 'en' ? (en || de) : (de || en)
}

function categoryColor(c: string) {
  return c === 'fix' ? 'error' : c === 'improvement' ? 'success' : 'primary'
}

useSeoMeta({
  title: () => t('changelog.title'),
  description: () => t('changelog.description'),
})
</script>

<template>
  <div class="space-y-8 py-4 sm:py-8">
    <div>
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{{ t('changelog.title') }}</h1>
      <p class="mt-2 text-muted">{{ t('changelog.description') }}</p>
    </div>

    <p v-if="!entries.length" class="text-muted">{{ t('changelog.empty') }}</p>

    <template v-else>
      <UChangelogVersions>
        <UChangelogVersion
          v-for="entry in entries"
          :key="entry.$id"
          :title="localized(entry, 'title')"
          :date="entry.date"
        >
          <template #badge>
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge :color="categoryColor(entry.category)" variant="subtle" size="sm">
                {{ t(`admin.changelog.category.${entry.category || 'feature'}`) }}
              </UBadge>
              <UBadge v-if="entry.version" color="neutral" variant="subtle" size="sm">{{ entry.version }}</UBadge>
            </div>
          </template>
          <template #body>
            <MDC :value="localized(entry, 'body')" class="changelog-body text-muted" />
          </template>
        </UChangelogVersion>
      </UChangelogVersions>

      <div v-if="hasMore" class="flex justify-center">
        <UButton color="neutral" variant="subtle" :loading="pending" @click="loadMore">
          {{ t('changelog.loadMore') }}
        </UButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Schlanke Prose-Styles für die gerenderten Markdown-Bodies (ohne Typography-Plugin) */
.changelog-body :deep(p) { margin-block: 0.35rem; }
.changelog-body :deep(ul) { list-style: disc; padding-inline-start: 1.25rem; margin-block: 0.35rem; }
.changelog-body :deep(ol) { list-style: decimal; padding-inline-start: 1.25rem; margin-block: 0.35rem; }
.changelog-body :deep(li) { margin-block: 0.15rem; }
.changelog-body :deep(h2),
.changelog-body :deep(h3) { font-weight: 600; margin-block: 0.6rem 0.25rem; color: var(--ui-text); }
.changelog-body :deep(a) { text-decoration: underline; }
.changelog-body :deep(blockquote) { border-inline-start: 2px solid currentColor; padding-inline-start: 0.75rem; opacity: 0.85; }
.changelog-body :deep(code) { font-family: var(--font-mono, monospace); font-size: 0.9em; }
.changelog-body :deep(pre) { overflow-x: auto; padding: 0.5rem 0.75rem; border-radius: 0.375rem; background: color-mix(in oklch, currentColor 8%, transparent); }
.changelog-body :deep(pre) code { font-size: 0.85em; }
</style>
