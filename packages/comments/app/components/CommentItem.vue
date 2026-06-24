<script setup lang="ts">
import type { Comment } from '../../shared/types/comment'

const props = defineProps<{ comment: Comment }>()

const { t } = useI18n()
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

async function reportComment() {
  busy.value = true
  try {
    await store.report(props.comment.$id)
    toast.add({ title: t('comments.item.reportedToast'), color: 'success' })
  }
  catch {
    toast.add({ title: t('comments.item.error'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <article class="rounded-lg border border-default p-3" data-comment :data-comment-id="comment.$id">
    <div class="flex items-center gap-2 text-xs text-muted">
      <UserAvatar :user="{ name: comment.authorName, prefs: { avatarUrl: comment.authorAvatarUrl } }" size="2xs" />
      <span class="font-medium text-default">{{ comment.authorName }}</span>
      <span>·</span>
      <span>{{ formatDate(comment.$createdAt) }}</span>
      <UBadge v-if="comment.status === 'reported'" color="warning" variant="subtle" size="sm">
        {{ t('comments.item.reported') }}
      </UBadge>
    </div>

    <p v-if="isDeleted" class="mt-1 text-sm italic text-muted">{{ t('comments.item.deleted') }}</p>

    <template v-else-if="editing">
      <UTextarea v-model="editContent" :rows="3" class="mt-2 w-full" />
      <div class="mt-2 flex gap-2">
        <UButton size="xs" :loading="busy" @click="saveEdit">{{ t('comments.item.save') }}</UButton>
        <UButton size="xs" color="neutral" variant="ghost" @click="editing = false">{{ t('comments.item.cancel') }}</UButton>
      </div>
    </template>

    <p v-else class="mt-1 whitespace-pre-line text-sm">{{ comment.content }}</p>

    <div v-if="!editing" class="mt-2 flex items-center gap-1">
      <VoteButtons :comment="comment" />

      <template v-if="!isDeleted">
        <UButton
          v-if="isLoggedIn && canWrite"
          size="xs" color="neutral" variant="ghost" icon="i-ph-chat-circle"
          @click="replying = !replying"
        >
          {{ t('comments.item.reply') }}
        </UButton>
        <template v-if="isAuthor">
          <UButton v-if="canWrite" size="xs" color="neutral" variant="ghost" icon="i-ph-pencil-simple" @click="startEdit">
            {{ t('comments.item.edit') }}
          </UButton>
          <UButton v-if="canDelete" size="xs" color="neutral" variant="ghost" icon="i-ph-trash" :loading="busy" @click="remove">
            {{ t('comments.item.delete') }}
          </UButton>
        </template>
        <UButton
          v-else-if="isLoggedIn && comment.status === 'active' && canWrite"
          size="xs" color="neutral" variant="ghost" icon="i-ph-flag"
          @click="reportComment"
        >
          {{ t('comments.item.report') }}
        </UButton>
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
