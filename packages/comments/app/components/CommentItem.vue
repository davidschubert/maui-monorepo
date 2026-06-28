<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Comment } from '../../shared/types/comment'

const props = withDefaults(defineProps<{
  comment: Comment
  childCount?: number
  collapsed?: boolean
}>(), { childCount: 0, collapsed: false })

const emit = defineEmits<{ toggleCollapse: [] }>()

const { t } = useI18n()
const { formatRelativeTime } = useFormatRelativeTime()
const { formatDate } = useFormatDate()
const store = useCommentStore()
const toast = useToast()
const { user, isLoggedIn } = useCurrentUser()
const { canWrite, canDelete } = useCommentPolicy()

const isAuthor = computed(() => user.value?.$id === props.comment.authorId)
const isDeleted = computed(() => props.comment.status === 'deleted')

const replying = ref(false)
const editing = ref(false)
const editContent = ref('')
const busy = ref(false)

function startEdit() {
  editContent.value = props.comment.content
  editing.value = true
}

async function saveEdit() {
  if (!editContent.value.trim()) return
  busy.value = true
  try {
    await store.updateComment(props.comment.$id, editContent.value)
    editing.value = false
  }
  catch {
    toast.add({ title: t('comments.item.error'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

async function remove() {
  busy.value = true
  try {
    await store.deleteComment(props.comment.$id)
  }
  catch {
    toast.add({ title: t('comments.item.error'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

// Edit / Delete des Autors hinter dem ⋯-Menü. Melden (andere) ist ein eigener
// ReportButton (Moderation-Layer) — siehe Aktionszeile.
const menuItems = computed<DropdownMenuItem[][]>(() => {
  if (isDeleted.value || !isAuthor.value) return []
  const items: DropdownMenuItem[] = []
  if (canWrite.value) items.push({ label: t('comments.item.edit'), icon: 'i-ph-pencil-simple', onSelect: startEdit })
  if (canDelete.value) items.push({ label: t('comments.item.delete'), icon: 'i-ph-trash', color: 'error', onSelect: () => { void remove() } })
  return items.length ? [items] : []
})

// Melden: nur eingeloggte Nicht-Autoren, solange schreibbar und sichtbar
const canReport = computed(() =>
  !isDeleted.value && isLoggedIn.value && !isAuthor.value && canWrite.value
  && props.comment.status === 'active',
)

// Reason-Katalog liefert der Konsument (comments) lokalisiert — Moderation bleibt agnostisch
const reportReasons = computed(() => [
  { value: 'spam', label: t('comments.report.reasons.spam') },
  { value: 'harassment', label: t('comments.report.reasons.harassment') },
  { value: 'offtopic', label: t('comments.report.reasons.offtopic') },
  { value: 'other', label: t('comments.report.reasons.other') },
])
</script>

<template>
  <article class="text-sm" data-comment :data-comment-id="comment.$id">
    <!-- Kopfzeile: Avatar · Name · relative Zeit · bearbeitet · gemeldet -->
    <div class="flex items-center gap-1.5 text-xs text-muted">
      <UserAvatar :user="{ name: comment.authorName, prefs: { avatarUrl: comment.authorAvatarUrl } }" size="2xs" />
      <span class="font-medium text-default">{{ comment.authorName }}</span>
      <span aria-hidden="true">·</span>
      <span :title="formatDate(comment.$createdAt)">{{ formatRelativeTime(comment.$createdAt) }}</span>
    </div>

    <p v-if="isDeleted" class="mt-1 italic text-muted">{{ t('comments.item.deleted') }}</p>

    <template v-else-if="editing">
      <UTextarea v-model="editContent" :rows="3" class="mt-2 w-full" />
      <div class="mt-2 flex gap-2">
        <UButton size="xs" :loading="busy" @click="saveEdit">{{ t('comments.item.save') }}</UButton>
        <UButton size="xs" color="neutral" variant="ghost" @click="editing = false">{{ t('comments.item.cancel') }}</UButton>
      </div>
    </template>

    <p v-else class="mt-1 whitespace-pre-line">{{ comment.content }}</p>

    <!-- Aktionszeile: Votes · Antworten ein-/ausklappen · Antworten · ⋯ -->
    <div v-if="!editing" class="mt-1 flex items-center gap-0.5 text-muted">
      <VoteButtons :comment="comment" />

      <UButton
        v-if="childCount > 0"
        size="xs" color="neutral" variant="ghost"
        :icon="collapsed ? 'i-ph-caret-down' : 'i-ph-caret-up'"
        :aria-label="collapsed ? t('comments.item.expandReplies') : t('comments.item.collapseReplies')"
        @click="emit('toggleCollapse')"
      >
        {{ childCount }}
      </UButton>

      <template v-if="!isDeleted">
        <UButton
          v-if="isLoggedIn && canWrite"
          size="xs" color="neutral" variant="ghost" icon="i-ph-chat-circle"
          @click="replying = !replying"
        >
          {{ t('comments.item.reply') }}
        </UButton>

        <ReportButton
          v-if="canReport"
          target-type="comment"
          :target-id="comment.$id"
          :reasons="reportReasons"
          :reported="store.isReportedByMe(comment.$id)"
          @update:reported="(v: boolean) => store.setReported(comment.$id, v)"
        />

        <UDropdownMenu v-if="menuItems.length" :items="menuItems" :content="{ align: 'start' }">
          <UButton size="xs" color="neutral" variant="ghost" icon="i-ph-dots-three" :aria-label="t('comments.item.more')" />
        </UDropdownMenu>
      </template>
    </div>

    <CommentForm
      v-if="replying"
      :parent-id="comment.$id"
      class="mt-3"
      @created="replying = false"
    />
  </article>
</template>
