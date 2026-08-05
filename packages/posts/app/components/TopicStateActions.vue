<script setup lang="ts">
import { decideTopicStateChange, type TopicStateField } from '../../shared/topicState'
import type { CommunityPost } from '../../shared/types/post'

/**
 * Die Zustands-Schalter EINES Themas: anheften, schließen, „gelöst"
 * (F1 Stufe 3).
 *
 * WELCHE Punkte erscheinen, entscheidet dieselbe PURE Regel, die der Server
 * durchsetzt (`decideTopicStateChange`) — nicht eine zweite, hier
 * nachgebaute. Das ist der Grund, warum die Regel überhaupt in `shared/`
 * liegt: ein Menüpunkt, der beim Klick 403 erntet, ist schlimmer als keiner.
 *
 * NUR SICHTBARKEIT, NIE AUTORITÄT: die Rolle kommt aus dem SSR-gespiegelten
 * State (useCommunityCapability, ≤30 s alt). Wer sie manipuliert, sieht
 * Schaltflächen — und bekommt vom Server ein 403. Genau diese Arbeitsteilung
 * meint der Kopf von useCommunityRole.
 *
 * OPTIMISTISCH, ABER MIT RÜCKWEG: der Zustand kippt sofort (ein Anheften soll
 * sich wie ein Schalter anfühlen), und bei einem Fehler zurück. Ohne das
 * Zurücksetzen stünde nach einem abgelehnten Klick eine Lüge auf dem Schirm.
 */
const props = defineProps<{ post: CommunityPost }>()
const emit = defineEmits<{ updated: [post: CommunityPost] }>()

const { t } = useI18n()
const toast = useToast()
const { user } = useCurrentUser()
// `posts.arrange` seit F1 Teilpaket 3 — dieselbe Capability, die die Route
// prüft. Sie kommt aus Rolle ODER Vertrauensstufe (useCommunityRole führt beide
// zusammen), damit eine ernannte Stufe 4 ihr Menü auch sieht.
const canArrange = useCommunityCapability('posts.arrange')

const pending = ref<TopicStateField | null>(null)

function may(field: TopicStateField): boolean {
  return decideTopicStateChange(
    field,
    { userId: user.value?.$id ?? '', canArrange: canArrange.value },
    { authorId: props.post.authorId, status: props.post.status },
  ).allowed
}

/**
 * Ein Eintrag je ERLAUBTEM Feld. Die Beschriftung sagt, was der Klick TUT
 * („Schließen" / „Wieder öffnen"), nicht wie der Zustand heißt — ein Menü ist
 * eine Liste von Handlungen.
 */
const items = computed(() => {
  const entries: { label: string, icon: string, onSelect: () => void }[] = []
  if (may('pinned')) {
    entries.push(props.post.pinned
      ? { label: t('posts.discussions.state.unpin'), icon: 'i-ph-push-pin-slash', onSelect: () => set('pinned', false) }
      : { label: t('posts.discussions.state.pin'), icon: 'i-ph-push-pin', onSelect: () => set('pinned', true) })
  }
  if (may('closed')) {
    entries.push(props.post.closed
      ? { label: t('posts.discussions.state.reopen'), icon: 'i-ph-lock-open', onSelect: () => set('closed', false) }
      : { label: t('posts.discussions.state.close'), icon: 'i-ph-lock-simple', onSelect: () => set('closed', true) })
  }
  if (may('solved')) {
    entries.push(props.post.solved
      ? { label: t('posts.discussions.state.markUnsolved'), icon: 'i-ph-arrow-counter-clockwise', onSelect: () => set('solved', false) }
      : { label: t('posts.discussions.state.markSolved'), icon: 'i-ph-check-circle', onSelect: () => set('solved', true) })
  }
  return [entries]
})

async function set(field: TopicStateField, value: boolean) {
  if (pending.value) return
  pending.value = field
  const before = props.post[field]
  // Sofort kippen — und zwar über das Emit, damit die Seite EINE Wahrheit hat
  // (die Karte daneben liest denselben Beitrag).
  emit('updated', { ...props.post, [field]: value })
  try {
    await $fetch(`/api/posts/${props.post.$id}/state`, {
      method: 'PATCH',
      body: { field, value },
    })
  }
  catch (error) {
    emit('updated', { ...props.post, [field]: before })
    toast.add({
      title: t('posts.discussions.state.failed'),
      description: (error as { data?: { reason?: string } })?.data?.reason === 'topic_not_published'
        ? t('posts.discussions.state.failedNotPublished')
        : t('posts.discussions.state.failedHint'),
      color: 'error',
      icon: 'i-ph-warning',
    })
  }
  finally {
    pending.value = null
  }
}
</script>

<template>
  <!-- Kein Menü, wenn nichts drinstünde: ein leerer Knopf ist ein Versprechen
       ohne Inhalt. -->
  <UDropdownMenu v-if="items[0]?.length" :items="items" :popper="{ placement: 'bottom-end' }">
    <UButton
      icon="i-ph-dots-three-outline"
      color="neutral"
      variant="ghost"
      size="xs"
      :loading="pending !== null"
      :aria-label="t('posts.discussions.state.menu')"
      data-topic-state-menu
    />
  </UDropdownMenu>
</template>
