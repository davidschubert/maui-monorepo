<script setup lang="ts">
import { COMMENTS_TABLE, type Comment } from '../../shared/types/comment'

const props = defineProps<{ postId: string }>()

const config = useRuntimeConfig()

const { data, refresh } = await useFetch<{ total: number, rows: Comment[] }>('/api/comments', {
  query: { postId: props.postId },
})

const comments = computed(() => data.value?.rows ?? [])

// Realtime mit Filter auf postId — nur Events DIESES Posts lösen den
// Refresh aus (client-seitig; Server-Query-Subscriptions sind Cloud-only)
useRealtimeRows<Comment>(
  config.public.appwriteDatabaseId,
  COMMENTS_TABLE,
  () => { void refresh() },
  { where: payload => payload.postId === props.postId },
)
</script>

<template>
  <section class="space-y-4">
    <CommentForm :post-id="postId" @created="() => refresh()" />

    <p v-if="comments.length === 0" class="text-sm text-muted">
      Noch keine Kommentare — schreib den ersten!
    </p>

    <ul v-else class="space-y-3">
      <li
        v-for="comment in comments"
        :key="comment.$id"
        class="rounded-lg border border-default p-3"
        :class="{ 'ml-6': comment.parentId }"
      >
        <div class="flex items-center gap-2 text-xs text-muted">
          <span class="font-medium text-default">{{ comment.authorName }}</span>
          <span>·</span>
          <span>{{ formatDate(comment.$createdAt) }}</span>
        </div>
        <p class="mt-1 text-sm">{{ comment.text }}</p>
        <div class="mt-2">
          <VoteButtons :comment-id="comment.$id" />
        </div>
      </li>
    </ul>
  </section>
</template>
