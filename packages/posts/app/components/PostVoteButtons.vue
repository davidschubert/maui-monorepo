<script setup lang="ts">
import type { FeedPost, PostVoteResponse, PostVoteValue } from '../../shared/types/post'

/**
 * Up-/Downvote auf einen Post (Toggle wie comments/VoteButtons — bewusst
 * eigener Layer-Baustein: comment_votes hängen an Kommentar-Rows, Posts
 * haben ihr eigenes Datenmodell). Server antwortet autoritativ mit
 * Zählern + myVote; die Karte übernimmt beides.
 */
const props = defineProps<{ post: FeedPost }>()

const emit = defineEmits<{ updated: [post: FeedPost] }>()

const { t } = useI18n()
const toast = useToast()
const { isLoggedIn } = useCurrentUser()

const busy = ref(false)

async function vote(value: PostVoteValue) {
  if (busy.value || !isLoggedIn.value) return
  busy.value = true
  try {
    const res = await $fetch<PostVoteResponse>(`/api/posts/${props.post.$id}/score`, {
      method: 'POST',
      body: { value },
    })
    emit('updated', { ...props.post, ...res.post, myPostVote: res.myVote })
  }
  catch {
    toast.add({ title: t('posts.card.voteFailed'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-0.5" data-post-votes>
    <UButton
      size="xs"
      :color="post.myPostVote === 1 ? 'primary' : 'neutral'"
      :variant="post.myPostVote === 1 ? 'soft' : 'ghost'"
      icon="i-ph-arrow-up"
      :disabled="!isLoggedIn || busy"
      :aria-label="t('posts.card.upvote')"
      data-post-upvote
      @click="vote(1)"
    />
    <span class="min-w-5 text-center text-xs font-medium tabular-nums" data-post-score>{{ post.score ?? 0 }}</span>
    <UButton
      size="xs"
      :color="post.myPostVote === -1 ? 'error' : 'neutral'"
      :variant="post.myPostVote === -1 ? 'soft' : 'ghost'"
      icon="i-ph-arrow-down"
      :disabled="!isLoggedIn || busy"
      :aria-label="t('posts.card.downvote')"
      data-post-downvote
      @click="vote(-1)"
    />
  </div>
</template>
