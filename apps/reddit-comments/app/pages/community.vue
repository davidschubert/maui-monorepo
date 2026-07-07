<script setup lang="ts">
/**
 * App-Override der posts-Layer-Seite: füllt den #comments-Slot mit dem
 * comments-Layer (targetType 'post') und liefert die Kommentar-Counts für
 * die Buttons — genau die A14-Komposition, für die beide Layer gebaut sind
 * (die App darf beide kennen, sie sich nicht).
 */
const { t } = useI18n()

useHead({ title: () => t('posts.feed.title') })

// Kommentar-Anzahl je Post (comments-Layer-API), nachgeladen sobald der
// Feed seine Ids meldet — best-effort, ohne Counts zeigen die Buttons den CTA
const replyCounts = ref<Record<string, number>>({})
async function loadCounts(ids: string[]) {
  if (ids.length === 0) return
  try {
    const res = await $fetch<{ counts: Record<string, number> }>('/api/comments/counts', {
      query: { targetType: 'post', targetIds: ids.join(',') },
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
        <CommentSection :target-id="post.$id" target-type="post" target-url="/community" />
      </template>
    </PostFeed>
  </UContainer>
</template>
