<script setup lang="ts">
/**
 * BAUPLAN-Komposition Feed + Kommentare (umgezogen aus apps/comments,
 * 2026-07-27): füllt den #comments-Slot des posts-Layers mit dem
 * comments-Layer (targetType 'post') und liefert die Kommentar-Counts für
 * die Buttons. Vorher lag diese Verdrahtung nur in der comments-App —
 * die Pool-Sites (platform) zeigten denselben Feed OHNE Kommentare.
 * Jetzt existiert sie genau einmal; jede Site, die blueprint extended,
 * bekommt exakt dasselbe Produktverhalten (PRODUKT-BILANZ.md).
 */
const { t } = useI18n()

// „Feed · <Brand>" + lokalisierte Beschreibung (Audit-Befunde S8/S5): der Titel
// war markenlos und in EN wie DE gleich, geteilte Links kamen nackt an.
useBrandTitle(() => t('posts.feed.title'), { description: () => t('posts.feed.description') })

// Kommentar-Anzahl je Post (comments-Layer-API). Die ERSTE Seite wird im
// SSR mitgeladen, damit die Buttons ohne Wort→Zahl-Flash hydratisieren:
// derselbe useFetch-Key wie in PostFeed → EIN Request, geteilter Payload.
// useRequestFetch statt $fetch: im Pool entscheidet der Host über den
// Mandanten — $fetch verlöre ihn im SSR (CLAUDE.md).
const requestFetch = useRequestFetch()
const { data: firstPage } = await useFetch<{ rows: { $id: string }[] }>('/api/posts')
const initialIds = firstPage.value?.rows.map(row => row.$id) ?? []
const { data: initialCounts } = await useFetch<{ counts: Record<string, number> }>('/api/comments/counts', {
  query: { targetType: 'post', targetIds: initialIds.join(',') },
  immediate: initialIds.length > 0,
})

const replyCounts = ref<Record<string, number>>({ ...(initialCounts.value?.counts ?? {}) })

// Weitere Seiten/neue Posts, sobald der Feed seine Ids meldet — nur die noch
// unbekannten nachladen (die SSR-Ids sind schon da); best-effort, ohne Counts
// zeigen die Buttons den Verb-CTA
async function loadCounts(ids: string[]) {
  const missing = ids.filter(id => !(id in replyCounts.value))
  if (missing.length === 0) return
  try {
    const res = await requestFetch<{ counts: Record<string, number> }>('/api/comments/counts', {
      query: { targetType: 'post', targetIds: missing.join(',') },
    })
    replyCounts.value = { ...replyCounts.value, ...res.counts }
  }
  catch {
    // Buttons fallen auf den Verb-CTA zurück
  }
}
</script>

<template>
  <UContainer class="max-w-2xl py-8">
    <h1 class="text-2xl font-bold">{{ t('posts.feed.title') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('posts.feed.description') }}</p>

    <PostFeed class="mt-6" :reply-counts="replyCounts" @rows-changed="loadCounts">
      <template #comments="{ post }">
        <CommentSection :target-id="post.$id" target-type="post" target-url="/feed" />
      </template>
    </PostFeed>
  </UContainer>
</template>
