<script setup lang="ts">
import { COMMENTS_TABLE, type Comment, type SortMode } from '../../shared/types/comment'

const props = defineProps<{
  targetId: string
  targetType: string
  /** Pfad der Seite für die Reply-Notification — Default: aktueller Route-Pfad */
  targetUrl?: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
// Ein Store PRO Target — Seiten mit mehreren Sections (Community-Feed)
// bekommen getrennten Zustand; die Kinder injecten genau diesen Store.
const store = useCommentStoreFor(props.targetType, props.targetId)
provide(commentStoreKey, store)
const config = useRuntimeConfig()
const { isLoggedIn } = useCurrentUser()

// Kommentar-Policy aus den Laufzeit-Flags bereitstellen (synchron, vor await).
// Refs auf Top-Level holen — verschachtelte Refs (policy.canWrite) unwrappen im
// Template NICHT automatisch.
const { canWrite, reason } = provideCommentPolicy()

// Auf-/Zuklapp-Zustand des Trees bereitstellen + pro Target persistieren
provideThreadCollapse(props.targetType, props.targetId)

const notice = computed(() => reason.value === 'maintenance'
  ? { title: t('comments.disabled.maintenanceTitle'), text: t('comments.disabled.maintenanceText') }
  : { title: t('comments.disabled.title'), text: t('comments.disabled.text') })

// SSR-Load — Pinia-State hydratisiert in den Client
await useAsyncData(`comments:${props.targetType}:${props.targetId}`, async () => {
  await store.fetchComments(props.targetId, props.targetType, props.targetUrl ?? route.path)
  return true
})

const sortOptions = computed(() => [
  { label: t('comments.sort.top'), value: 'top', icon: 'i-ph-arrow-fat-up' },
  { label: t('comments.sort.new'), value: 'new', icon: 'i-ph-clock' },
  { label: t('comments.sort.trending'), value: 'trending', icon: 'i-ph-fire' },
  { label: t('comments.sort.discussed'), value: 'discussed', icon: 'i-ph-chats-circle' },
])

const sort = computed({
  get: () => store.sortMode,
  set: (mode: SortMode) => { void store.setSortMode(mode) },
})

// Gezieltes Einfügen fremder Kommentare — Filter auf DIESES Target
useRealtimeRows<Comment>(
  config.public.appwriteDatabaseId,
  COMMENTS_TABLE,
  event => store.applyRealtime(event),
  { where: payload => payload.targetId === props.targetId && payload.targetType === props.targetType },
)

// Thread-Presence: wer schaut zu / tippt / antwortet / liest wo.
const { present, others, typingOthers, viewerCount, setTyping, setReplyingTo, setNear, replyingOthers, nearOthers }
  = useThreadPresence(props.targetType, props.targetId)
provide(commentTypingKey, setTyping)
provide(commentReplyingKey, setReplyingTo)
provide(threadPresenceKey, { replyingOthers, nearOthers, setNear })

// Lese-Präsenz: sichtbarsten Kommentar per IntersectionObserver ermitteln und als
// `near` melden — so zeigt jeder Kommentar, wer ihn gerade liest.
const sectionEl = ref<HTMLElement | null>(null)
let io: IntersectionObserver | undefined
const ratios = new Map<string, number>()
function pickNear() {
  let bestId: string | undefined
  let best = 0
  for (const [id, r] of ratios) if (r > best) { best = r; bestId = id }
  setNear(best > 0.2 ? bestId : undefined)
}
function observeComments() {
  if (!io || !sectionEl.value) return
  io.disconnect()
  ratios.clear()
  for (const el of sectionEl.value.querySelectorAll('[data-comment-id]')) io.observe(el)
}
onMounted(() => {
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const id = (e.target as HTMLElement).dataset.commentId
      if (id) ratios.set(id, e.isIntersecting ? e.intersectionRatio : 0)
    }
    pickNear()
  }, { threshold: [0, 0.25, 0.5, 0.75, 1] })
  observeComments()
})
// Auf die ID-Menge watchen, nicht nur die Länge: beim optimistischen Posten wird
// temp-<id> gegen die Server-ID getauscht (Länge gleich!) — der neue DOM-Knoten
// (key = $id) muss trotzdem re-observed werden, sonst fehlt er der Lese-Präsenz.
watch(() => store.rows.map(row => row.$id).join(','), () => nextTick(observeComments))
onScopeDispose(() => io?.disconnect())

const typingText = computed(() => {
  const names = typingOthers.value.map(u => u.userName)
  if (names.length === 0) return ''
  if (names.length === 1) return t('comments.presence.typingOne', { name: names[0] })
  if (names.length === 2) return t('comments.presence.typingTwo', { a: names[0], b: names[1] })
  return t('comments.presence.typingMany', { name: names[0], count: names.length - 1 })
})

// Zustands-Icon je Avatar in der Gruppe (der Avatar selbst BLEIBT immer): im
// anderen Tab → Mond, tippt → Stift, antwortet → Pfeil. „away" hat Vorrang, weil
// der User dann nicht aktiv in DIESEM Thread ist.
function presenceBadge(u: PresenceUser): { icon?: string, iconColor?: 'success' | 'info' | 'neutral' } {
  if (u.away) return { icon: 'i-ph-moon', iconColor: 'neutral' }
  if (u.typing) return { icon: 'i-ph-pencil-simple-line', iconColor: 'success' }
  if (u.replyingTo) return { icon: 'i-ph-arrow-bend-up-left', iconColor: 'info' }
  return {}
}
function presenceLabel(u: PresenceUser): string {
  if (u.away) return t('comments.presence.avatarAway', { name: u.userName })
  if (u.typing) return t('comments.presence.avatarTyping', { name: u.userName })
  if (u.replyingTo) return t('comments.presence.avatarReplying', { name: u.userName })
  return u.userName
}
</script>

<template>
  <section ref="sectionEl" class="space-y-5" data-comment-section>
    <header class="flex items-center justify-between gap-4">
      <h2 class="text-lg font-semibold">{{ t('comments.title') }} ({{ store.total }})</h2>
      <!-- content min-w-fit: die Dropdown-Breite folgt sonst dem schmalen
           Trigger („Neu") und schneidet längere Options-Labels ab -->
      <USelect v-model="sort" :items="sortOptions" size="sm" :ui="{ content: 'min-w-fit' }" :aria-label="t('comments.sort.label')" />
    </header>

    <div v-if="others.length || typingText" class="flex min-h-6 flex-wrap items-center gap-3 text-xs text-muted" data-thread-presence>
      <template v-if="others.length">
        <!-- Alle Anwesenden (inkl. dir) als Gruppe. color=primary färbt die
             Initialen-Avatare; hat der User ein Profilbild, gewinnt das Bild.
             PresenceAvatar setzt ein Zustands-Icon in die Ecke (tippt/antwortet). -->
        <UAvatarGroup size="3xl" :max="8" color="primary">
          <UTooltip v-for="u in present" :key="u.userId" :text="presenceLabel(u)">
            <PresenceAvatar :name="u.userName" :avatar-url="u.avatarUrl" v-bind="presenceBadge(u)" />
          </UTooltip>
        </UAvatarGroup>
        <span>{{ t('comments.presence.here', { count: viewerCount }) }}</span>
      </template>
      <span v-if="typingText" class="text-primary">{{ typingText }}</span>
    </div>

    <UAlert
      v-if="!canWrite"
      color="neutral"
      variant="subtle"
      icon="i-ph-lock-simple"
      :title="notice.title"
      :description="notice.text"
    />
    <!-- Formular in Kommentar-Karten-Optik (gleiche Box wie CommentItem):
         beim Absenden „verwandelt" sich die Eingabe visuell in den Kommentar,
         der direkt darunter aufklappt -->
    <div v-else-if="isLoggedIn" class="rounded-lg bg-elevated/40 p-3 ring ring-default" data-comment-composer>
      <CommentForm />
    </div>
    <p v-else class="text-sm text-muted">
      <ULink :to="localePath('/login')" class="font-medium text-primary">{{ t('comments.loginLink') }}</ULink>{{ t('comments.loginSuffix') }}
    </p>

    <div v-if="store.pendingCount" class="flex justify-center">
      <UButton color="primary" variant="soft" size="sm" icon="i-ph-arrow-up" @click="store.flushPending()">
        {{ t('comments.newCount', { count: store.pendingCount }) }}
      </UButton>
    </div>

    <p v-if="store.threaded.length === 0 && !store.loading" class="text-sm text-muted">
      {{ t('comments.empty') }}
    </p>

    <CommentThread v-else :nodes="store.threaded" />

    <div v-if="store.total > store.rows.length" class="flex justify-center pt-2">
      <UButton
        color="neutral"
        variant="subtle"
        size="sm"
        block
        icon="i-ph-caret-down"
        :loading="store.loading"
        @click="store.loadAll()"
      >
        {{ t('comments.loadAll', { count: store.total }) }}
      </UButton>
    </div>
  </section>
</template>
