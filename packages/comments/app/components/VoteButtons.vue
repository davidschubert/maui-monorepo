<script setup lang="ts">
import type { Comment } from '../../shared/types/comment'

const props = defineProps<{ comment: Comment }>()

const { t } = useI18n()
const store = useCommentStore()
const toast = useToast()
const { isLoggedIn } = useCurrentUser()

const myVote = computed(() => store.myVote(props.comment.$id))
const disabled = computed(() => !isLoggedIn.value || props.comment.status === 'deleted')

async function vote(value: 1 | -1) {
  if (disabled.value) return
  try {
    // Optimistic im Store — Zähler springen sofort, Rollback bei Fehler
    await store.vote(props.comment.$id, value)
  }
  catch {
    toast.add({ title: t('comments.item.voteError'), color: 'error' })
  }
}
</script>

<template>
  <div class="flex items-center" data-vote-buttons>
    <UButton
      icon="i-ph-arrow-up"
      size="xs"
      :color="myVote === 1 ? 'primary' : 'neutral'"
      :variant="myVote === 1 ? 'soft' : 'ghost'"
      :disabled="disabled"
      :aria-label="t('comments.item.upvote')"
      @click="vote(1)"
    />
    <span class="min-w-6 text-center text-xs font-semibold tabular-nums" data-score>{{ comment.score }}</span>
    <UButton
      icon="i-ph-arrow-down"
      size="xs"
      :color="myVote === -1 ? 'primary' : 'neutral'"
      :variant="myVote === -1 ? 'soft' : 'ghost'"
      :disabled="disabled"
      :aria-label="t('comments.item.downvote')"
      @click="vote(-1)"
    />
  </div>
</template>
