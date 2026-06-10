<script setup lang="ts">
import type { CommentVote } from '../../shared/types/comment'

const props = defineProps<{ commentId: string }>()

const { isLoggedIn } = useCurrentUser()
const pending = ref(false)
const current = ref<1 | -1 | null>(null)

async function vote(value: 1 | -1) {
  if (!isLoggedIn.value || pending.value) return
  pending.value = true
  try {
    const row = await $fetch<CommentVote>(`/api/comments/${props.commentId}/vote`, {
      method: 'POST',
      body: { value },
    })
    current.value = row.value === 1 ? 1 : -1
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-1">
    <UButton
      icon="i-ph-arrow-up"
      size="xs"
      :color="current === 1 ? 'primary' : 'neutral'"
      variant="ghost"
      :disabled="!isLoggedIn || pending"
      aria-label="Upvote"
      @click="vote(1)"
    />
    <UButton
      icon="i-ph-arrow-down"
      size="xs"
      :color="current === -1 ? 'primary' : 'neutral'"
      variant="ghost"
      :disabled="!isLoggedIn || pending"
      aria-label="Downvote"
      @click="vote(-1)"
    />
  </div>
</template>
