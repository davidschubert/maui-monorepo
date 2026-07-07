<script setup lang="ts">
import type { PollState } from '../../shared/types/post'

/**
 * Umfrage-Block: Optionen als Buttons; Prozente/Balken erst nach eigener
 * Stimme oder Poll-Ende (Plan P3). Gleiche Option erneut = Stimme zurück.
 */
const props = defineProps<{
  postId: string
  poll: PollState
}>()

const emit = defineEmits<{ updated: [poll: PollState] }>()

const { t } = useI18n()
const toast = useToast()
const { isLoggedIn } = useCurrentUser()
const localePath = useLocalePath()

const busy = ref(false)

function percent(index: number): number {
  if (!props.poll.results || props.poll.totalVotes === 0) return 0
  return Math.round(((props.poll.counts[index] ?? 0) / props.poll.totalVotes) * 100)
}

async function vote(index: number) {
  if (busy.value || props.poll.ended || !isLoggedIn.value) return
  busy.value = true
  try {
    const res = await $fetch<{ poll: PollState }>(`/api/posts/${props.postId}/vote`, {
      method: 'POST',
      body: { optionIndex: index },
    })
    if (res.poll) emit('updated', res.poll)
  }
  catch {
    toast.add({ title: t('posts.poll.voteFailed'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-1.5" data-poll>
    <button
      v-for="(option, index) in poll.options"
      :key="index"
      type="button"
      class="relative block w-full overflow-hidden rounded-md border text-start text-sm transition-colors"
      :class="[
        poll.myVote === index ? 'border-primary' : 'border-default',
        poll.ended || !isLoggedIn ? 'cursor-default' : 'hover:border-primary/60',
      ]"
      :disabled="busy"
      :data-poll-option="index"
      @click="vote(index)"
    >
      <!-- Ergebnis-Balken (nur sichtbar, wenn results) -->
      <span
        v-if="poll.results"
        class="absolute inset-y-0 start-0 bg-primary/15 transition-all"
        :style="{ width: `${percent(index)}%` }"
        aria-hidden="true"
      />
      <span class="relative flex items-center justify-between gap-2 px-3 py-2">
        <span class="flex items-center gap-2">
          <UIcon
            v-if="poll.myVote === index"
            name="i-ph-check-circle-fill"
            class="size-4 shrink-0 text-primary"
          />
          {{ option }}
        </span>
        <span v-if="poll.results" class="shrink-0 text-xs font-medium tabular-nums" data-poll-percent>
          {{ percent(index) }} %
        </span>
      </span>
    </button>

    <p class="flex flex-wrap items-center gap-x-3 text-xs text-muted">
      <span v-if="poll.results" data-poll-total>{{ t('posts.poll.votes', { count: poll.totalVotes }) }}</span>
      <span v-else>{{ t('posts.poll.hiddenResults') }}</span>
      <span v-if="poll.ended" class="text-warning">{{ t('posts.poll.ended') }}</span>
      <NuxtLink v-if="!isLoggedIn" :to="localePath('/login')" class="text-primary hover:underline">
        {{ t('posts.poll.loginToVote') }}
      </NuxtLink>
    </p>
  </div>
</template>
