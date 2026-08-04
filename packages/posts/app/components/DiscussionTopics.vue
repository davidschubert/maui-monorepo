<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { TOP_PERIODS, isTopPeriod, isTopicOrder, type TopPeriod } from '../../shared/discussionSort'
import type { DiscussionListResponse, DiscussionTopic } from '../../shared/types/post'

/**
 * Die Topics-Tabelle der Discussions (F1 Stufe 1) — UTable, wie jede
 * Datenliste seit B6.
 *
 * SPALTEN: Thema (Headline, darunter die Kategorie) · Autor · Antworten ·
 * Aufrufe · Aktivität.
 *
 * „Aufrufe" kam mit Stufe 2 dazu (eigene Zähl-Tabelle `post_views`, gepuffert
 * geschrieben — die Begründung steht in server/utils/topicViews.ts). Die eine
 * Spalte aus Davids Katalog, die weiter FEHLT, ist „Users": sie meint die
 * Avatare ALLER Beteiligten. Wer beteiligt ist, weiß nur der comments-Layer,
 * und ein Produkt-Layer darf einen anderen nicht kennen (A14). Die Komposition
 * in blueprint dürfte es — sie müsste dafür aber je Topic die Kommentar-LISTE
 * holen (die Zähl-Route liefert nur Zahlen), also 25 Abfragen für eine Seite.
 * Das ist der Preis einer Avatar-Reihe nicht wert. Es steht deshalb weiter der
 * AUTOR dort, und die Spalte heißt „Autor" statt „Users" — eine Reihe, die so
 * tut, als zeige sie alle, wäre die schlechtere Antwort.
 *
 * Die Kommentar-Anzahl liefert die SEITE (blueprint) über die
 * comments-Counts-API und reicht sie als Prop herein — genau wie beim Feed.
 */
const props = defineProps<{
  /** Auf eine Kategorie eingegrenzt (Kategorie-Seite) — leer = alle Topics. */
  categorySlug?: string
  /** Antwort-Anzahl je Topic-Id; liefert die Komposition (comments-Layer). */
  replyCounts?: Record<string, number>
}>()

const emit = defineEmits<{ rowsChanged: [ids: string[]] }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const localePath = useLocalePath()
const { formatRelativeTime } = useFormatRelativeTime()

/**
 * Sortierung und Suche stehen in der URL, nicht nur im Kopf der Komponente:
 * eine sortierte, gefilterte Liste ist etwas, das man verschickt. `replace`
 * statt `push` — sonst füllt jedes Umschalten die Zurück-Historie.
 */
const order = ref(isTopicOrder(route.query.order) && route.query.order !== 'categories' ? route.query.order : 'latest')
const period = ref<TopPeriod>(isTopPeriod(route.query.period) ? route.query.period : 'all')
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const searchQuery = ref(search.value)

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  // 350 ms: lang genug, dass ein getipptes Wort EINE Abfrage auslöst, kurz
  // genug, dass die Liste sich noch wie eine Reaktion anfühlt.
  searchTimer = setTimeout(() => { searchQuery.value = value.trim() }, 350)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

watch([order, period, searchQuery], () => {
  void router.replace({
    query: {
      ...route.query,
      order: order.value === 'latest' ? undefined : order.value,
      period: order.value === 'top' && period.value !== 'all' ? period.value : undefined,
      q: searchQuery.value || undefined,
    },
  })
})

const orderItems = computed(() => [
  { value: 'latest', label: t('posts.discussions.order.latest'), icon: 'i-ph-clock-counter-clockwise' },
  { value: 'top', label: t('posts.discussions.order.top'), icon: 'i-ph-trend-up' },
])
const periodItems = computed(() => TOP_PERIODS.map(value => ({
  value,
  label: t(`posts.discussions.period.${value}`),
})))

const { data, status } = await useFetch<DiscussionListResponse>('/api/posts/discussions', {
  query: computed(() => ({
    category: props.categorySlug || undefined,
    order: order.value,
    period: order.value === 'top' ? period.value : undefined,
    q: searchQuery.value || undefined,
  })),
})

const rows = ref<DiscussionTopic[]>([])
const nextCursor = ref<string | null>(null)
watch(data, (value) => {
  rows.value = value?.rows ?? []
  nextCursor.value = value?.nextCursor ?? null
}, { immediate: true })

// Ids nach außen melden — die Komposition lädt dazu die Antwort-Anzahlen.
watch(() => rows.value.map(row => row.$id).join(','), () => {
  emit('rowsChanged', rows.value.map(row => row.$id))
}, { immediate: true })

const loadingMore = ref(false)
async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const res = await $fetch<DiscussionListResponse>('/api/posts/discussions', {
      query: {
        category: props.categorySlug || undefined,
        order: order.value,
        period: order.value === 'top' ? period.value : undefined,
        q: searchQuery.value || undefined,
        cursor: nextCursor.value,
      },
    })
    const known = new Set(rows.value.map(row => row.$id))
    rows.value = [...rows.value, ...res.rows.filter(row => !known.has(row.$id))]
    nextCursor.value = res.nextCursor
  }
  finally {
    loadingMore.value = false
  }
}

// Autor und Aktivität sind Kontext — auf schmalen Schirmen fallen sie weg
// (dasselbe Muster wie die Moderations-Tabelle).
const HIDE_SM = { td: 'hidden sm:table-cell', th: 'hidden sm:table-cell' }
const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }

const columns = computed<TableColumn<DiscussionTopic>[]>(() => [
  { id: 'topic', header: () => t('posts.discussions.col.topic') },
  { id: 'author', header: () => t('posts.discussions.col.author'), meta: { class: HIDE_MD } },
  { id: 'replies', header: () => t('posts.discussions.col.replies'), meta: { class: HIDE_SM } },
  // Aufrufe fallen als erste weg: von den drei Zahlen ist sie die, die am
  // wenigsten über das Thema aussagt.
  { id: 'views', header: () => t('posts.discussions.col.views'), meta: { class: HIDE_MD } },
  { id: 'activity', header: () => t('posts.discussions.col.activity'), meta: { class: HIDE_SM } },
])

const hasSearch = computed(() => searchQuery.value.length > 0)
function resetSearch() {
  search.value = ''
  searchQuery.value = ''
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <UTabs
        v-model="order"
        :items="orderItems"
        :content="false"
        size="sm"
        data-discussions-order
      />
      <USelect
        v-if="order === 'top'"
        v-model="period"
        :items="periodItems"
        size="sm"
        class="min-w-32"
        :aria-label="t('posts.discussions.period.label')"
        data-discussions-period
      />
      <UInput
        v-model="search"
        icon="i-ph-magnifying-glass"
        size="sm"
        :placeholder="t('posts.discussions.search')"
        class="ms-auto max-w-56"
        data-discussions-search
      />
    </div>

    <div v-if="status === 'pending' && rows.length === 0" class="flex justify-center py-16">
      <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
    </div>

    <UTable v-else :data="rows" :columns="columns" data-discussions-table>
      <template #topic-cell="{ row }">
        <div class="min-w-0 max-w-lg">
          <NuxtLink
            :to="localePath(row.original.path)"
            class="block truncate font-medium text-default hover:text-primary hover:underline"
            :title="row.original.title"
          >
            {{ row.original.title }}
          </NuxtLink>
          <NuxtLink
            v-if="!props.categorySlug"
            :to="localePath(`/discussions/${row.original.categorySlug}`)"
            class="text-xs text-muted hover:text-primary hover:underline"
          >
            {{ row.original.categoryName }}
          </NuxtLink>
        </div>
      </template>

      <template #author-cell="{ row }">
        <div class="flex items-center gap-2">
          <UserAvatar
            :user="{ name: row.original.authorName, prefs: { avatarUrl: row.original.authorAvatarUrl } }"
            size="xs"
          />
          <span class="truncate text-sm text-muted">{{ row.original.authorName }}</span>
        </div>
      </template>

      <!-- Strich statt Null, solange die Zahl noch nicht da ist: eine Null
           wäre eine Aussage, die niemand geprüft hat. -->
      <template #replies-cell="{ row }">
        <span class="text-sm tabular-nums text-muted">
          {{ props.replyCounts?.[row.original.$id] === undefined
            ? '—'
            : formatCount(props.replyCounts[row.original.$id]!) }}
        </span>
      </template>

      <!-- Anders als bei den Antworten steht hier eine echte Null: die Zahl
           kommt aus derselben Antwort wie die Zeile, ist also nie „noch
           unbekannt". -->
      <template #views-cell="{ row }">
        <span class="text-sm tabular-nums text-muted">{{ formatCount(row.original.views) }}</span>
      </template>

      <template #activity-cell="{ row }">
        <span class="whitespace-nowrap text-sm text-muted">
          {{ formatRelativeTime(row.original.lastActivityAt) }}
        </span>
      </template>

      <template #empty>
        <CoreEmptyState
          v-if="hasSearch"
          icon="i-ph-magnifying-glass"
          :title="t('posts.discussions.noResultsTitle')"
          :description="t('posts.discussions.noResultsText')"
          :action-label="t('posts.discussions.resetSearch')"
          action-icon="i-ph-arrow-counter-clockwise"
          @action="resetSearch"
        />
        <CoreEmptyState
          v-else
          icon="i-ph-chats-circle"
          :title="t('posts.discussions.emptyTitle')"
          :description="t('posts.discussions.emptyText')"
        />
      </template>
    </UTable>

    <div v-if="nextCursor" class="pt-2 text-center">
      <UButton color="neutral" variant="subtle" :loading="loadingMore" @click="loadMore">
        {{ t('posts.discussions.loadMore') }}
      </UButton>
    </div>
  </div>
</template>
