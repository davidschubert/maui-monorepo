<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { createCommentSchema } from '../../schemas/comment'

const props = defineProps<{
  /** Gesetzt = Antwort-Formular, sonst Top-Level-Kommentar */
  parentId?: string
}>()

const emit = defineEmits<{ created: [] }>()

const { t } = useI18n()
const store = useCommentStore()
const toast = useToast()
const loading = ref(false)

// Thread-Presence: Tippen melden (von CommentSection bereitgestellt; Fallback no-op)
const setTyping = inject(commentTypingKey, () => {})
// Antwort-Presence: „ich antworte auf <parentId>" folgt dem AKTIVEN Feld (Fokus/
// Eingabe), NICHT dem Öffnen — sonst bliebe der Hinweis bei mehreren offenen
// Antwort-Formularen am zuerst geöffneten hängen. Nur für Antworten (parentId).
const setReplyingTo = inject(commentReplyingKey, () => {})
function activateReply() {
  if (props.parentId) setReplyingTo(props.parentId)
}
if (props.parentId) {
  onScopeDispose(() => setReplyingTo(undefined))
}

// Tippen + Antwort-Ziel gemeinsam melden (dieses Feld ist gerade aktiv)
function onInput(event?: Event) {
  setTyping(state.content.length > 0)
  activateReply()
  if (event?.target instanceof HTMLTextAreaElement) updateMention(event.target)
}

// ── @-Mention-Autocomplete ───────────────────────────────────────────────
// Vorschlagsbasis = Teilnehmer des Threads (distinct Autoren der geladenen
// Kommentare) — dieselbe Menge, gegen die der Server Mentions auflöst
// (server/utils/mentions.ts). Kein User-Suche-Endpoint nötig (Privacy).
const auth = useAuthStore()
const mentionQuery = ref<string | null>(null) // null = Popup zu
const mentionStart = ref(0)

const participants = computed(() => {
  const seen = new Map<string, string>()
  for (const row of store.rows) {
    if (row.authorId && row.authorName && row.authorId !== auth.user?.$id && row.status !== 'deleted') {
      seen.set(row.authorId, row.authorName)
    }
  }
  return [...seen.values()]
})

const mentionSuggestions = computed(() => {
  if (mentionQuery.value === null || mentionQuery.value.length > 30) return []
  const q = mentionQuery.value.toLowerCase()
  return participants.value.filter(name => name.toLowerCase().startsWith(q)).slice(0, 5)
})

function updateMention(el: HTMLTextAreaElement) {
  const caret = el.selectionStart ?? state.content.length
  const before = state.content.slice(0, caret)
  const at = before.lastIndexOf('@')
  // '@' nur am Wortanfang; Query ohne Zeilenumbruch (sonst „@" mitten im Text)
  if (at >= 0 && (at === 0 || /\s/.test(before[at - 1]!)) && !before.slice(at + 1).includes('\n')) {
    mentionQuery.value = before.slice(at + 1)
    mentionStart.value = at
  }
  else {
    mentionQuery.value = null
  }
}

function pickMention(name: string) {
  const caretEnd = mentionStart.value + 1 + (mentionQuery.value?.length ?? 0)
  state.content = `${state.content.slice(0, mentionStart.value)}@${name} ${state.content.slice(caretEnd)}`
  mentionQuery.value = null
}

// Formular validiert nur den Text — Target/parentId kommen aus Store/Props
const schema = computed(() => createCommentSchema(t).pick({ content: true }))
type FormInput = z.infer<typeof schema.value>

const state = reactive<FormInput>({ content: '' })

async function onSubmit(event: FormSubmitEvent<FormInput>) {
  loading.value = true
  try {
    // Optimistic im Store — erscheint sofort, Rollback bei Fehler
    await store.addComment(event.data.content, props.parentId)
    state.content = ''
    setTyping(false)
    setReplyingTo(undefined)
    emit('created')
  }
  catch (error) {
    const code = (error as { data?: { data?: { code?: string } } })?.data?.data?.code
    const key = code === 'maintenance'
      ? 'comments.disabled.maintenanceToast'
      : code === 'comments_disabled' ? 'comments.disabled.toast' : 'comments.form.error'
    toast.add({ title: t(key), color: 'error' })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UForm :schema="schema" :validate-on="[]" :state="state" class="space-y-2" @submit="onSubmit">
    <UFormField name="content">
      <UTextarea
        v-model="state.content"
        :rows="parentId ? 2 : 3"
        :placeholder="parentId ? t('comments.form.replyPlaceholder') : t('comments.form.placeholder')"
        class="w-full"
        @focusin="activateReply"
        @input="onInput"
        @keydown.escape="mentionQuery = null"
      />
      <div
        v-if="mentionSuggestions.length"
        class="mt-1 w-fit min-w-48 rounded-md border border-default bg-default p-1 shadow-sm"
        role="listbox"
        :aria-label="t('comments.form.mentionSuggestions')"
      >
        <UButton
          v-for="name in mentionSuggestions"
          :key="name"
          color="neutral"
          variant="ghost"
          size="xs"
          block
          class="justify-start"
          @click="pickMention(name)"
        >
          @{{ name }}
        </UButton>
      </div>
    </UFormField>
    <div class="flex items-center justify-between gap-2">
      <UButton type="submit" size="sm" :loading="loading">
        {{ parentId ? t('comments.form.replySubmit') : t('comments.form.submit') }}
      </UButton>
      <span class="text-xs text-dimmed">{{ t('comments.form.markdownHint') }}</span>
    </div>
  </UForm>
</template>
