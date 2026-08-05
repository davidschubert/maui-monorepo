<script setup lang="ts">
import { bodyToSave as decideBodyToSave } from '../../../core/shared/editorBody'
import { decidePostAuthorAction } from '../../shared/postAuthorPolicy'
import { mayEditPost, mayEditPostField } from '../../shared/postEditRights'
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
  /**
   * Kommentare beim Aufbau schon aufgeklappt (F1).
   *
   * Im FEED bleiben sie zu — dort ist die Karte eine von vielen, und
   * aufgeklappte Kommentare machten aus dem Strom eine Wand. Auf einer
   * TOPIC-Seite ist die Diskussion der Grund des Besuchs; sie erst
   * wegzuklicken wäre eine Hürde ohne Zweck.
   */
  defaultCommentsOpen?: boolean
}>()

const emit = defineEmits<{ deleted: [id: string], updated: [post: FeedPost] }>()

const { t } = useI18n()
const toast = useToast()
const { user } = useCurrentUser()
const { formatRelativeTime } = useFormatRelativeTime()
// Der Hinweis „bearbeitet" trägt das genaue Datum im Titel — sichtbar bleibt
// ein Wort, nachlesbar ist der Zeitpunkt (Muster CommentItem).
const { formatDate } = useFormatDate()

const TYPE_ICONS: Record<string, string> = {
  poll: 'i-ph-chart-bar-horizontal',
  question: 'i-ph-question',
}

/**
 * Was der Betrachter mit DIESEM Beitrag darf — dieselbe pure Regel, die die
 * Routen durchsetzen (C16). `hasForeignPollVotes` bleibt bewusst offen: der
 * Client kann fremde Vote-Rows nicht lesen, also gilt eine Umfrage hier als
 * gesperrt — genau das Verhalten, das dieses Menü vorher hart verdrahtet hatte.
 */
const authorAction = computed(() => decidePostAuthorAction(
  { authorId: props.post.authorId, status: props.post.status, type: props.post.type },
  user.value?.$id,
))
const isAuthor = computed(() => authorAction.value.isAuthor)

/**
 * WAS DARF DER BETRACHTER AN EINEM FREMDEN BEITRAG? (F1 Teilpaket 3.)
 *
 * Dieselben zwei Capabilities, die die Route prüft — sie kommen aus Rolle ODER
 * Vertrauensstufe (useCommunityRole führt beide zusammen). Ohne diese Zeilen
 * hätte eine Stufe 3 ihr Recht, aber keinen Knopf: die Route ließe sie durch,
 * niemand fände den Weg dorthin.
 */
const canCurate = useCommunityCapability('posts.curate')
const canRevise = useCommunityCapability('posts.revise')
const editActor = computed(() => ({
  isAuthor: isAuthor.value,
  canCurate: canCurate.value,
  canRevise: canRevise.value,
}))
/**
 * Ein FREMDER Beitrag ist über diese Karte nur bearbeitbar, solange der Autor
 * es selbst wäre — Status und Poll-Sperre gelten für alle (so entscheidet auch
 * die Route). `canEdit` beantwortet das für den Autor; für alle anderen sagt
 * `reason` nur „nicht der Autor", und genau dann greift die Stufen-Frage.
 */
const canEditForeign = computed(() =>
  !isAuthor.value
  && authorAction.value.reason === 'not_author'
  // Eine Umfrage bleibt gesperrt: der Client kann fremde Stimmen nicht zählen,
  // und die Manipulations-Fläche wird nicht kleiner, wenn ein anderer sie
  // öffnet. Dieselbe konservative Sicht wie bei `hasForeignPollVotes`.
  && props.post.type !== 'poll'
  && props.post.status === 'published'
  && mayEditPost(editActor.value))
/** Nur wer den TEXT ändern darf, bekommt eine beschreibbare Schreibfläche. */
const mayEditBody = computed(() => mayEditPostField('body', editActor.value))
const commentsOpen = ref(props.defaultCommentsOpen === true)

const editing = ref(false)
const editTitle = ref('')
const editBody = ref('')
const busy = ref(false)

/**
 * „ÖFFNEN DARF NICHTS ÄNDERN" (Regel + Begründung: core/shared/editorBody.ts).
 *
 * Seit die Schreibfläche ein WYSIWYG-Editor ist, schreibt sie den Text beim
 * Montieren einmal von sich aus um (`snake_case` → `snake\_case`). Beides
 * rendert identisch — aber ein Speichern OHNE Tastendruck wäre trotzdem eine
 * Änderung, und daran hängt sichtbar „bearbeitet" (shared/postEdit.ts). Der
 * Leser bekäme also gesagt, am Text habe sich etwas getan, obwohl er
 * unverändert aussieht.
 *
 * `editNormalized` ist die erste Fassung, die der Editor selbst geschrieben
 * hat; steht beim Speichern noch genau sie im Feld, geht die Urfassung raus.
 */
const editPristine = ref('')
const editNormalized = ref<string | null>(null)
watch(editBody, (value) => {
  if (editing.value && editNormalized.value === null && value !== editPristine.value) {
    editNormalized.value = value
  }
})

function startEdit() {
  editTitle.value = props.post.title ?? ''
  editBody.value = props.post.body
  editPristine.value = props.post.body
  editNormalized.value = null
  editing.value = true
}

async function saveEdit() {
  if (busy.value || !editBody.value.trim()) return
  const body = decideBodyToSave({
    current: editBody.value,
    pristine: editPristine.value,
    normalized: editNormalized.value,
  }).trim()
  busy.value = true
  try {
    const updated = await $fetch<FeedPost>(`/api/posts/${props.post.$id}`, {
      method: 'PATCH',
      body: {
        title: editTitle.value.trim() || undefined,
        // Wer den Text nicht ändern darf (Kurator, Stufe 3), schickt ihn
        // UNANGETASTET zurück — weder getrimmt noch vom Editor normalisiert.
        // Hier treffen sich zwei Regeln: F48s „Öffnen darf nichts ändern"
        // (decideBodyToSave oben) schützt den AUTOR vor der stillen
        // Editor-Umschreibung, und die Kurator-Grenze schützt den Beitrag vor
        // einer Textänderung, die der Kurator gar nicht wollte — die Route
        // antwortete darauf 403.
        body: mayEditBody.value ? body : props.post.body,
      },
    })
    emit('updated', { ...props.post, ...updated })
    editing.value = false
  }
  catch {
    toast.add({ title: t('posts.card.editFailed'), description: t('posts.card.editFailedHint'), color: 'error' })
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
    toast.add({ title: t('posts.card.deleteFailed'), description: t('posts.card.deleteFailedHint'), color: 'error' })
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
    toast.add({ title: t('posts.card.reported'), description: t('posts.card.reportedHint'), color: 'success' })
  }
  catch (error) {
    /**
     * SCHON GEMELDET ist kein Fehlschlag (Moderations-Audit Befund 3,
     * 2026-08-01): die Route antwortet dafür seit dem Audit 409 mit
     * `reason: 'already_reported'`. Ohne diesen Zweig stünde hier „Die Meldung
     * kam nicht an" — falsch, sie liegt längst vor. Die Karte hat (anders als
     * ReportButton) keinen „bereits gemeldet"-Zustand; ein Hinweis ist deshalb
     * die ganze richtige Antwort.
     */
    const already = (error as { data?: { reason?: string } })?.data?.reason === 'already_reported'
    toast.add(already
      ? { title: t('posts.card.reportAlready'), color: 'info' as const }
      : { title: t('posts.card.reportFailed'), description: t('posts.card.reportFailedHint'), color: 'error' as const })
  }
}

// gleiche Grund-Palette wie comments (moderation-Vertrag hält reason generisch)
const REPORT_REASONS = ['spam', 'harassment', 'offtopic', 'other'] as const

interface MenuItem { label: string, icon?: string, color?: 'error', onSelect?: () => void, children?: MenuItem[] }
const menuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = []
  if (authorAction.value.canEdit) {
    items.push({ label: t('posts.card.edit'), icon: 'i-ph-pencil-simple', onSelect: startEdit })
  }
  // Fremd, aber erlaubt (F1 Teilpaket 3): eigene Beschriftung, weil es eine
  // andere Handlung ist — „Bearbeiten" an einem fremden Text klänge, als wäre
  // es der eigene.
  else if (canEditForeign.value) {
    items.push({
      label: mayEditBody.value ? t('posts.card.editForeign') : t('posts.card.retitle'),
      icon: 'i-ph-pencil-line',
      onSelect: startEdit,
    })
  }
  if (authorAction.value.canDelete) {
    items.push({ label: t('posts.card.delete'), icon: 'i-ph-trash', color: 'error', onSelect: removePost })
  }
  // Melden ist die Aktion der ANDEREN — sie hängt an der Autorschaft, nicht
  // daran, ob gerade eine eigene Aktion erlaubt wäre.
  if (!isAuthor.value && user.value) {
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
          <!-- F1: „bearbeitet" steht nur da, wenn der TEXT geändert wurde —
               nicht beim Anheften, Umkategorisieren oder Abstimmen (die Regel
               dahinter: shared/postEdit.ts). Muster CommentItem, damit Thema
               und Antwort darunter dieselbe Sprache sprechen. -->
          <span v-if="post.editedAt" class="text-xs text-dimmed" :title="formatDate(post.editedAt)">· {{ t('posts.card.edited') }}</span>
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
        <!-- Dieselbe Schreibfläche wie im Composer (PostBodyField) — neu
             schreiben und bearbeiten dürfen nicht auseinanderlaufen.
             `immediate`: wer „Bearbeiten" geklickt hat, will schreiben — hier
             ist der Zwischenschritt über die Textfläche nur ein Klick mehr.

             Wer nur ordnen darf (Stufe 3), sieht den Text, kann ihn aber nicht
             ändern: ihn auszublenden nähme den Zusammenhang, in dem ein Titel
             überhaupt zu beurteilen ist. Die Route lehnt eine Änderung ohnehin
             ab — hier wird sie erst gar nicht angeboten. -->
        <PostBodyField
          v-if="mayEditBody"
          v-model="editBody"
          :placeholder="t(`posts.composer.placeholder.${post.type}`)"
          immediate
          data-post-edit-body
        />
        <div v-else class="rounded-lg border border-default bg-elevated/30 p-3">
          <MarkdownContent :source="post.body" class="text-sm text-muted" />
          <p class="mt-2 text-xs text-dimmed">{{ t('posts.card.retitleHint') }}</p>
        </div>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" size="xs" @click="() => { editing = false }">{{ t('ui.cancel') }}</UButton>
          <UButton size="xs" :loading="busy" @click="saveEdit">{{ t('posts.card.save') }}</UButton>
        </div>
      </template>
      <ContentClamp v-else :lines="6" :text="post.body">
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
          @click="() => { commentsOpen = !commentsOpen }"
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
