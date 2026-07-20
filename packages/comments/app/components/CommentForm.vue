<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { createCommentSchema } from '../../schemas/comment'

const props = defineProps<{
  /** Gesetzt = Antwort-Formular, sonst Top-Level-Kommentar */
  parentId?: string
  /** Feld beim Einblenden fokussieren (Antwort-Formulare) */
  autofocus?: boolean
}>()

const emit = defineEmits<{ created: [] }>()

// Antwort-Formulare fokussieren beim Einblenden — der User hat gerade
// „Antworten" geklickt, der Cursor gehört ins Feld (native autofocus greift
// bei dynamisch eingefügten Elementen nicht zuverlässig).
const contentField = useTemplateRef('contentField')
onMounted(() => {
  if (props.autofocus) contentField.value?.textareaRef?.focus()
})

const { t } = useI18n()
// Store der umgebenden CommentSection (ein Store pro Target, Phase 25)
const store = inject(commentStoreKey)!
const toast = useToast()
const loading = ref(false)

// Quora-Muster: Top-Level-Feld ruht EINZEILIG in der Liste und expandiert
// beim Fokus zum Editor (Aktionszeile erscheint); nach dem Absenden — oder
// beim Verlassen ohne Text — kollabiert es zurück. Antworten starten
// expandiert (der User hat gerade „Antworten" geklickt).
const expanded = ref(!!props.parentId)
function onFormFocusOut(event: FocusEvent) {
  if (props.parentId) return
  const root = event.currentTarget as HTMLElement
  const next = event.relatedTarget as Node | null
  if (next && root.contains(next)) return
  if (!state.content.trim()) expanded.value = false
}

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
    // Zurück in den Ruhezustand — der frische Kommentar klappt daneben auf,
    // die Eingabe „wurde" sichtbar zum Kommentar (Quora-Muster)
    if (!props.parentId) {
      expanded.value = false
      contentField.value?.textareaRef?.blur()
    }
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
  <div class="flex items-start gap-2" @focusout="onFormFocusOut">
    <!-- Eigener Avatar vor dem Feld (Quora-Muster): die Eingabe liest sich
         als „mein werdender Kommentar" -->
    <UserAvatar v-if="!parentId" size="sm" class="mt-0.5 shrink-0" />

    <UForm :schema="schema" :validate-on="[]" :state="state" class="min-w-0 flex-1 space-y-2" @submit="onSubmit">
      <UFormField name="content">
        <UTextarea
          ref="contentField"
          v-model="state.content"
          :rows="expanded ? (parentId ? 2 : 3) : 1"
          autoresize
          :placeholder="parentId ? t('comments.form.replyPlaceholder') : t('comments.form.placeholder')"
          class="w-full"
          data-comment-input
          @focusin="() => { expanded = true; activateReply() }"
          @input="onInput"
          @keydown.escape="() => { mentionQuery = null }"
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
      <!-- Aktionszeile nur im Editor-Zustand — kollabiert ist das Feld eine ruhige Zeile -->
      <div v-if="expanded" class="flex items-center justify-between gap-2" data-comment-actions>
        <UButton type="submit" size="sm" :loading="loading">
          {{ parentId ? t('comments.form.replySubmit') : t('comments.form.submit') }}
        </UButton>
        <span class="text-xs text-dimmed">{{ t('comments.form.markdownHint') }}</span>
      </div>
    </UForm>
  </div>
</template>
