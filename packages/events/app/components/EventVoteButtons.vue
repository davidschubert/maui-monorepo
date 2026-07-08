<script setup lang="ts">
import type { EventRow, EventVoteResponse, EventVoteValue } from '../../shared/types/event'

/**
 * Up-/Downvote auf ein Event (Toggle wie posts/comments — bewusst eigener
 * Layer-Baustein, event_votes gehören zum events-Datenmodell). Server
 * antwortet autoritativ mit Zählern + myVote; der Konsument übernimmt beides.
 */
const props = defineProps<{
  event: Pick<EventRow, '$id' | 'score'>
  myVote: EventVoteValue | null
}>()

const emit = defineEmits<{ updated: [response: EventVoteResponse] }>()

const { t } = useI18n()
const toast = useToast()
const { isLoggedIn } = useCurrentUser()

const busy = ref(false)

async function vote(value: EventVoteValue) {
  if (busy.value || !isLoggedIn.value) return
  busy.value = true
  try {
    const res = await $fetch<EventVoteResponse>(`/api/events/${props.event.$id}/score`, {
      method: 'POST',
      body: { value },
    })
    emit('updated', res)
  }
  catch {
    toast.add({ title: t('events.vote.failed'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-0.5" data-event-votes>
    <UButton
      size="xs"
      :color="myVote === 1 ? 'primary' : 'neutral'"
      :variant="myVote === 1 ? 'soft' : 'ghost'"
      icon="i-ph-arrow-up"
      :disabled="!isLoggedIn || busy"
      :aria-label="t('events.vote.up')"
      data-event-upvote
      @click.prevent.stop="vote(1)"
    />
    <span class="min-w-5 text-center text-xs font-medium tabular-nums" data-event-score>{{ event.score ?? 0 }}</span>
    <UButton
      size="xs"
      :color="myVote === -1 ? 'error' : 'neutral'"
      :variant="myVote === -1 ? 'soft' : 'ghost'"
      icon="i-ph-arrow-down"
      :disabled="!isLoggedIn || busy"
      :aria-label="t('events.vote.down')"
      data-event-downvote
      @click.prevent.stop="vote(-1)"
    />
  </div>
</template>
