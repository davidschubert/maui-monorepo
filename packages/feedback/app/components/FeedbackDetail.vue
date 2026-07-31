<script setup lang="ts">
import {
  FEEDBACK_STATES,
  MAX_FEEDBACK_COMMENT,
  type FeedbackComment,
  type FeedbackEntry,
  type FeedbackState,
} from '../../../control/shared/customerFeedback'

/**
 * Ein Eintrag in ganzer Länge: Text, Zustand, Mitreden — und, NUR für den
 * Betreiber, die Herkunft und die Werkzeuge.
 *
 * DIE TRENNLINIE (Davids Entscheidung 2) ist `entry.origin`: der Server
 * schickt sie ausschließlich dem Betreiber (Projektion in
 * control/shared/customerFeedback.ts). Diese Komponente prüft deshalb
 * `entry.origin`, nicht etwa eine lokale Rolle — was nicht ankommt, kann auch
 * kein Markup versehentlich zeigen.
 */
const props = defineProps<{ entry: FeedbackEntry, operator: boolean }>()

const { t } = useI18n()
const { formatRelativeTime } = useFormatRelativeTime()
const { toggleVote, loadComments, addComment, updateEntry, muteCommunity } = useCustomerFeedback()

const comments = ref<FeedbackComment[]>([])
const loadingComments = ref(true)
const draft = ref('')
const posting = ref(false)
const voting = ref(false)
const moving = ref(false)

async function refreshComments() {
  loadingComments.value = true
  comments.value = await loadComments(props.entry.id)
  loadingComments.value = false
}

watch(() => props.entry.id, () => { void refreshComments() }, { immediate: true })

async function onVote() {
  voting.value = true
  await toggleVote(props.entry)
  voting.value = false
}

async function onComment() {
  const body = draft.value.trim()
  if (body.length < 2) return
  posting.value = true
  if (await addComment(props.entry, body)) {
    draft.value = ''
    await refreshComments()
  }
  posting.value = false
}

async function onMove(state: FeedbackState) {
  moving.value = true
  await updateEntry(props.entry, { state })
  moving.value = false
}

async function onToggleHidden() {
  moving.value = true
  await updateEntry(props.entry, { status: props.entry.status === 'hidden' ? 'visible' : 'hidden' })
  moving.value = false
}

async function onMute() {
  const origin = props.entry.origin
  if (!origin?.communityId) return
  await muteCommunity(origin.communityId, origin.communityName, true)
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-start gap-3">
      <FeedbackVoteButton :entry="props.entry" :busy="voting" @toggle="onVote" />
      <div class="min-w-0 flex-1 space-y-1">
        <h3 class="text-base font-semibold">{{ props.entry.title }}</h3>
        <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
          <UBadge color="neutral" variant="subtle" size="sm">{{ t(`feedback.states.${props.entry.state}`) }}</UBadge>
          <UBadge color="neutral" variant="outline" size="sm">{{ t(`feedback.areas.${props.entry.area}`) }}</UBadge>
          <span v-if="props.entry.productKey" class="font-mono">{{ props.entry.productKey }}</span>
          <span>{{ formatRelativeTime(props.entry.createdAt) }}</span>
          <UBadge v-if="props.entry.status === 'hidden'" color="warning" variant="subtle" size="sm">
            {{ t('feedback.list.hidden') }}
          </UBadge>
          <UBadge v-if="props.entry.mine" color="primary" variant="subtle" size="sm">
            {{ t('feedback.list.mine') }}
          </UBadge>
        </div>
      </div>
    </div>

    <p class="whitespace-pre-line text-sm">{{ props.entry.message }}</p>

    <!--
      HERKUNFT — nur der Betreiber bekommt sie überhaupt geschickt. „Firma X
      wünscht sich Funktion Y" ist eine Geschäftsinformation (Entscheidung 2).
    -->
    <div v-if="props.entry.origin" class="rounded-lg border border-default bg-elevated/40 p-3 text-xs" data-testid="feedback-origin">
      <p class="mb-1 font-medium">{{ t('feedback.admin.origin') }}</p>
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted">
        <dt>{{ t('feedback.admin.originCommunity') }}</dt>
        <dd>{{ props.entry.origin.communityName || props.entry.origin.communityId || t('feedback.admin.anonymous') }}</dd>
        <dt>{{ t('feedback.admin.originAuthor') }}</dt>
        <dd>{{ props.entry.origin.authorName || t('feedback.admin.anonymous') }}</dd>
        <dt v-if="props.entry.origin.authorEmail">{{ t('feedback.admin.originEmail') }}</dt>
        <dd v-if="props.entry.origin.authorEmail">
          <ULink :to="`mailto:${props.entry.origin.authorEmail}`">{{ props.entry.origin.authorEmail }}</ULink>
        </dd>
        <dt v-if="props.entry.page">{{ t('feedback.admin.originPage') }}</dt>
        <dd v-if="props.entry.page" class="font-mono">{{ props.entry.page }}</dd>
      </dl>
    </div>

    <!-- Betreiber-Werkzeuge: verschieben, verstecken, Community stummschalten. -->
    <div v-if="props.operator" class="flex flex-wrap items-center gap-2 border-t border-default pt-3">
      <UButton
        v-for="state in FEEDBACK_STATES"
        :key="state"
        size="xs"
        :color="props.entry.state === state ? 'primary' : 'neutral'"
        :variant="props.entry.state === state ? 'soft' : 'ghost'"
        :loading="moving && props.entry.state !== state"
        :data-feedback-state="state"
        @click="onMove(state)"
      >
        {{ t(`feedback.states.${state}`) }}
      </UButton>
      <div class="flex-1" />
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        :icon="props.entry.status === 'hidden' ? 'i-ph-eye' : 'i-ph-eye-slash'"
        :loading="moving"
        @click="onToggleHidden"
      >
        {{ props.entry.status === 'hidden' ? t('feedback.admin.show') : t('feedback.admin.hide') }}
      </UButton>
      <UButton
        v-if="props.entry.origin?.communityId"
        size="xs"
        color="error"
        variant="ghost"
        icon="i-ph-speaker-slash"
        @click="onMute"
      >
        {{ t('feedback.admin.mute') }}
      </UButton>
    </div>

    <!-- Mitreden: der Feedback-Bereich ist Bestandteil aller Dashboards. -->
    <div class="space-y-3 border-t border-default pt-4">
      <p class="text-sm font-medium">{{ t('feedback.list.comments', { count: props.entry.commentCount }) }}</p>

      <div v-if="loadingComments" class="flex justify-center py-4">
        <UIcon name="i-ph-spinner" class="size-5 animate-spin text-muted" />
      </div>
      <ul v-else-if="comments.length" class="space-y-3">
        <li v-for="comment in comments" :key="comment.id" class="text-sm">
          <p class="text-xs text-muted">
            <span class="font-medium text-default">{{ comment.authorName || t('feedback.list.someone') }}</span>
            · {{ formatRelativeTime(comment.createdAt) }}
          </p>
          <p class="whitespace-pre-line">{{ comment.body }}</p>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">{{ t('feedback.list.noComments') }}</p>

      <form class="space-y-2" @submit.prevent="onComment">
        <UTextarea
          v-model="draft"
          :rows="2"
          :maxlength="MAX_FEEDBACK_COMMENT"
          :placeholder="t('feedback.list.commentPlaceholder')"
          class="w-full"
          data-testid="feedback-comment-input"
        />
        <div class="flex justify-end">
          <UButton type="submit" size="sm" :loading="posting" :disabled="draft.trim().length < 2">
            {{ t('feedback.list.commentSend') }}
          </UButton>
        </div>
      </form>
    </div>
  </div>
</template>
