<script setup lang="ts">
import type { FeedPost, PollState } from '../../shared/types/post'

/**
 * Eine Feed-Karte (Post/Umfrage/Frage). Kommentare kommen über den
 * #comments-Slot — die APP bindet dort CommentSection ein (A14: dieser
 * Layer kennt comments nicht). Ohne Slot gibt es keinen Kommentar-Bereich.
 */
const props = defineProps<{
  post: FeedPost
  /** Kommentar-/Antwort-Anzahl (liefert die App via comments-Counts) */
  replyCount?: number
}>()

const emit = defineEmits<{ deleted: [id: string], updated: [post: FeedPost] }>()

const { t } = useI18n()
const toast = useToast()
const { user } = useCurrentUser()
const { formatRelativeTime } = useFormatRelativeTime()

const TYPE_ICONS: Record<string, string> = {
  poll: 'i-ph-chart-bar-horizontal',
  question: 'i-ph-question',
}

const isAuthor = computed(() => !!user.value && user.value.$id === props.post.authorId)
const commentsOpen = ref(false)

const editing = ref(false)
const editTitle = ref('')
const editBody = ref('')
const busy = ref(false)

function startEdit() {
  editTitle.value = props.post.title ?? ''
  editBody.value = props.post.body
  editing.value = true
}

async function saveEdit() {
  if (busy.value || !editBody.value.trim()) return
  busy.value = true
  try {
    const updated = await $fetch<FeedPost>(`/api/posts/${props.post.$id}`, {
      method: 'PATCH',
      body: { title: editTitle.value.trim() || undefined, body: editBody.value.trim() },
    })
    emit('updated', { ...props.post, ...updated })
    editing.value = false
  }
  catch {
    toast.add({ title: t('posts.card.editFailed'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

async function removePost() {
  if (busy.value) return
  busy.value = true
  try {
    await $fetch(`/api/posts/${props.post.$id}`, { method: 'DELETE' })
    toast.add({ title: t('posts.card.deleted'), color: 'success' })
    emit('deleted', props.post.$id)
  }
  catch {
    toast.add({ title: t('posts.card.deleteFailed'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

async function reportPost(reason: string) {
  try {
    await $fetch('/api/reports', {
      method: 'POST',
      body: { targetType: 'post', targetId: props.post.$id, reason },
    })
    toast.add({ title: t('posts.card.reported'), color: 'success' })
  }
  catch {
    toast.add({ title: t('posts.card.reportFailed'), color: 'error' })
  }
}

// gleiche Grund-Palette wie comments (moderation-Vertrag hält reason generisch)
const REPORT_REASONS = ['spam', 'harassment', 'offtopic', 'other'] as const

interface MenuItem { label: string, icon?: string, color?: 'error', onSelect?: () => void, children?: MenuItem[] }
const menuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = []
  if (isAuthor.value && props.post.type !== 'poll') {
    items.push({ label: t('posts.card.edit'), icon: 'i-ph-pencil-simple', onSelect: startEdit })
  }
  if (isAuthor.value) {
    items.push({ label: t('posts.card.delete'), icon: 'i-ph-trash', color: 'error', onSelect: removePost })
  }
  else if (user.value) {
    items.push({
      label: t('posts.card.report'),
      icon: 'i-ph-flag',
      children: REPORT_REASONS.map(reason => ({
        label: t(`posts.card.reasons.${reason}`),
        onSelect: () => reportPost(reason),
      })),
    })
  }
  return items
})

function onPollUpdated(poll: PollState) {
  emit('updated', { ...props.post, poll })
}

// Kommentar-Button: Zahl statt Wort, sobald es Kommentare gibt (82 · 13.4K);
// bei 0/unbekannt der Verb-CTA. Mit Zahl erklärt der Tooltip die Aktion.
const ctaLabel = computed(() => t(props.post.type === 'question' ? 'posts.card.answerCta' : 'posts.card.commentCta'))
const countLabel = computed(() => (props.replyCount ?? 0) > 0 ? formatCount(props.replyCount!) : ctaLabel.value)
const showTooltip = computed(() => (props.replyCount ?? 0) > 0)
</script>

<template>
  <UCard data-post-card :data-post-type="post.type">
    <div class="flex items-start gap-3">
      <UserAvatar :user="{ name: post.authorName, prefs: { avatarUrl: post.authorAvatarUrl } }" size="md" />
      <div class="min-w-0 flex-1">
        <p class="flex flex-wrap items-center gap-x-2 text-sm">
          <span class="font-semibold">{{ post.authorName || t('posts.card.someone') }}</span>
          <span class="text-xs text-dimmed">{{ formatRelativeTime(post.publishedAt || post.$createdAt) }}</span>
          <UIcon v-if="TYPE_ICONS[post.type]" :name="TYPE_ICONS[post.type]!" class="size-4 text-muted" />
        </p>
      </div>
      <UDropdownMenu v-if="menuItems.length" :items="menuItems">
        <UButton icon="i-ph-dots-three" color="neutral" variant="ghost" size="xs" :aria-label="t('posts.card.menu')" />
      </UDropdownMenu>
    </div>

    <div class="mt-3 space-y-3">
      <h3 v-if="post.title && !editing" class="font-semibold" :class="post.type === 'question' ? 'text-lg' : ''">{{ post.title }}</h3>

      <template v-if="editing">
        <UInput
          v-if="post.type === 'post'"
          v-model="editTitle"
          :placeholder="t('posts.composer.titlePlaceholder')"
          class="w-full"
          data-post-edit-title
        />
        <UTextarea v-model="editBody" :rows="3" autoresize class="w-full" />
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" size="xs" @click="editing = false">{{ t('ui.cancel') }}</UButton>
          <UButton size="xs" :loading="busy" @click="saveEdit">{{ t('posts.card.save') }}</UButton>
        </div>
      </template>
      <ContentClamp v-else :lines="6">
        <MarkdownContent
          :source="post.body"
          class="text-default"
          :class="post.type === 'question' && !post.title ? 'text-lg font-medium' : 'text-sm'"
        />
      </ContentClamp>

      <PollBlock v-if="post.type === 'poll' && post.poll" :post-id="post.$id" :poll="post.poll" @updated="onPollUpdated" />
    </div>

    <div class="mt-3 flex items-center gap-2 border-t border-default pt-2">
      <PostVoteButtons :post="post" @updated="p => emit('updated', p)" />

      <UTooltip :text="ctaLabel" :disabled="!showTooltip">
        <UButton
          :color="commentsOpen ? 'primary' : 'neutral'"
          :variant="commentsOpen ? 'soft' : 'ghost'"
          size="xs"
          icon="i-ph-chat-circle"
          :trailing-icon="commentsOpen ? 'i-ph-caret-up' : 'i-ph-caret-down'"
          :aria-label="ctaLabel"
          :aria-expanded="commentsOpen"
          data-post-comments-toggle
          @click="commentsOpen = !commentsOpen"
        >
          {{ countLabel }}
        </UButton>
      </UTooltip>
    </div>

    <!-- Ganze Kommentar-Ebene EINE Stufe unter dem Beitrag (Einrück-Optik
         wie Antworten unter Kommentaren: Linie + Einzug) -->
    <div v-if="commentsOpen" class="mt-2 ml-3 border-l border-default pl-4" data-post-comments>
      <!-- Die App füllt diesen Slot mit CommentSection (targetType 'post').
           Die Section hat async setup (Kommentare laden) — die Suspense-
           Grenze zeigt sofort ein Skeleton statt einer stummen Verzögerung. -->
      <Suspense>
        <div><slot name="comments" :post="post" /></div>
        <template #fallback>
          <div class="space-y-3 py-2" data-comments-skeleton>
            <div v-for="i in 2" :key="i" class="flex items-start gap-2">
              <USkeleton class="size-7 shrink-0 rounded-full" />
              <div class="flex-1 space-y-2 pt-1">
                <USkeleton class="h-3 w-1/3" />
                <USkeleton class="h-3 w-4/5" />
              </div>
            </div>
          </div>
        </template>
      </Suspense>
    </div>
  </UCard>
</template>
