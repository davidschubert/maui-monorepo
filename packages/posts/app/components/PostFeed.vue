<script setup lang="ts">
import { POSTS_TABLE, type CommunityPost, type FeedPost, type PostListResponse } from '../../shared/types/post'

/**
 * Der Community-Feed: Composer (eingeloggt), Karten-Liste, Cursor-Pagination
 * mit Infinite Scroll, Realtime-Pille „Neue Beiträge anzeigen" statt
 * Auto-Prepend (Scroll-Ruhe, Muster comments.newCount). Den #comments-Slot
 * reicht die Karte an die App durch (CommentSection, A14).
 */
const props = defineProps<{
  /**
   * Kommentar-Anzahl je Post-Id — liefert die APP (comments-Counts-API),
   * dieser Layer bleibt comments-agnostisch. Ohne Prop zeigen die Buttons
   * den Verb-CTA.
   */
  replyCounts?: Record<string, number>
}>()

const emit = defineEmits<{
  /** feuert bei jeder Änderung der sichtbaren Post-Ids (Laden/Nachladen/Neu) */
  rowsChanged: [ids: string[]]
}>()

const { t } = useI18n()
const config = useRuntimeConfig()
const { isLoggedIn, user } = useCurrentUser()

const rows = ref<FeedPost[]>([])
const nextCursor = ref<string | null>(null)
const pendingNew = ref(0)

// Hooks VOR dem ersten await (async-setup-Regel — sonst kein Realtime!)
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | undefined
const stops: Array<() => void> = []
onMounted(() => {
  // Realtime: fremde neue/publizierte Posts nur ZÄHLEN — die Pille lädt frisch
  stops.push(useRealtimeRows<CommunityPost>(
    config.public.appwriteDatabaseId,
    POSTS_TABLE,
    (ev) => {
      if (ev.payload.status !== 'published') return
      if (ev.payload.authorId === user.value?.$id) return
      if (rows.value.some(row => row.$id === ev.payload.$id)) return
      if (ev.type === 'create' || ev.type === 'update') pendingNew.value++
    },
  ))

  observer = new IntersectionObserver(async (entries) => {
    if (!entries.some(entry => entry.isIntersecting)) return
    await loadMore()
    const el = sentinel.value
    if (el && observer && nextCursor.value) {
      observer.unobserve(el)
      observer.observe(el)
    }
  }, { rootMargin: '300px' })
  if (sentinel.value) observer.observe(sentinel.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  for (const stop of stops) stop()
  stops.length = 0
})

const { data, pending, refresh } = await useFetch<PostListResponse>('/api/posts')
stops.push(watch(data, (value) => {
  if (!value) return
  rows.value = value.rows
  nextCursor.value = value.nextCursor
}, { immediate: true }))
// Ids nach außen melden (App lädt dazu die Kommentar-Counts)
stops.push(watch(() => rows.value.map(row => row.$id).join(','), () => {
  emit('rowsChanged', rows.value.map(row => row.$id))
}, { immediate: true }))

const loadingMore = ref(false)
async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const res = await $fetch<PostListResponse>('/api/posts', { query: { cursor: nextCursor.value } })
    const known = new Set(rows.value.map(row => row.$id))
    rows.value = [...rows.value, ...res.rows.filter(row => !known.has(row.$id))]
    nextCursor.value = res.nextCursor
  }
  finally {
    loadingMore.value = false
  }
}

async function showNew() {
  pendingNew.value = 0
  await refresh()
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

function onCreated(post: FeedPost, scheduled: boolean) {
  // Eigener Sofort-Post: direkt vorn einfügen (kein Warten auf Realtime)
  if (!scheduled) rows.value = [post, ...rows.value]
}

function onDeleted(id: string) {
  rows.value = rows.value.filter(row => row.$id !== id)
}

function onUpdated(post: FeedPost) {
  rows.value = rows.value.map(row => (row.$id === post.$id ? post : row))
}
</script>

<template>
  <div class="space-y-4">
    <PostComposer v-if="isLoggedIn" @created="onCreated" />
    <UAlert
      v-else
      color="neutral"
      variant="subtle"
      icon="i-ph-users-three"
      :title="t('posts.feed.guestTitle')"
      :description="t('posts.feed.guestText')"
    />

    <div v-if="pendingNew > 0" class="sticky top-2 z-10 text-center">
      <UButton size="sm" icon="i-ph-arrow-up" data-feed-new-pill @click="showNew">
        {{ t('posts.feed.newPosts', { count: pendingNew }) }}
      </UButton>
    </div>

    <p v-if="!pending && rows.length === 0" class="py-12 text-center text-sm text-muted" data-posts-empty>
      {{ t('posts.feed.empty') }}
    </p>

    <!-- Neue Posts KLAPPEN AUF (Höhe 0 → Zielhöhe, core expandTransition):
         der Feed gleitet mit statt zu springen -->
    <TransitionGroup v-else :css="false" tag="div" class="space-y-4" data-posts-list @enter="expandEnter" @leave="expandLeave">
      <PostCard
        v-for="post in rows"
        :key="post.$id"
        :post="post"
        :reply-count="props.replyCounts?.[post.$id]"
        @deleted="onDeleted"
        @updated="onUpdated"
      >
        <template #comments="{ post: slotPost }">
          <slot name="comments" :post="slotPost" />
        </template>
      </PostCard>
    </TransitionGroup>

    <div ref="sentinel" aria-hidden="true" class="h-px" data-posts-sentinel />

    <div v-if="nextCursor" class="pt-2 text-center">
      <UButton color="neutral" variant="subtle" :loading="loadingMore" @click="loadMore">
        {{ t('posts.feed.loadMore') }}
      </UButton>
    </div>
  </div>
</template>
