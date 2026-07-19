<script setup lang="ts">
/**
 * App-Override der posts-Layer-Seite: füllt den #comments-Slot mit dem
 * comments-Layer (targetType 'post') und liefert die Kommentar-Counts für
 * die Buttons — genau die A14-Komposition, für die beide Layer gebaut sind
 * (die App darf beide kennen, sie sich nicht).
 */
const { t } = useI18n()

useHead({ title: () => t('posts.feed.title') })

// Kommentar-Anzahl je Post (comments-Layer-API). Die ERSTE Seite wird im
// SSR mitgeladen, damit die Buttons ohne Wort→Zahl-Flash hydratisieren:
// derselbe useFetch-Key wie in PostFeed → EIN Request, geteilter Payload.
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
    const res = await $fetch<{ counts: Record<string, number> }>('/api/comments/counts', {
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
