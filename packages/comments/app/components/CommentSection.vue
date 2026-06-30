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
const store = useCommentStore()
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
  { label: t('comments.sort.top'), value: 'top' },
  { label: t('comments.sort.new'), value: 'new' },
  { label: t('comments.sort.controversial'), value: 'controversial' },
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

// Thread-Presence (#10): wer schaut zu / tippt; setTyping für den Composer bereitstellen
const { others, typingOthers, viewerCount, setTyping } = useThreadPresence(props.targetType, props.targetId)
provide(commentTypingKey, setTyping)

const typingText = computed(() => {
  const names = typingOthers.value.map(u => u.userName)
  if (names.length === 0) return ''
  if (names.length === 1) return t('comments.presence.typingOne', { name: names[0] })
  if (names.length === 2) return t('comments.presence.typingTwo', { a: names[0], b: names[1] })
  return t('comments.presence.typingMany', { name: names[0], count: names.length - 1 })
})
</script>

<template>
  <section class="space-y-5" data-comment-section>
    <header class="flex items-center justify-between gap-4">
      <h2 class="text-lg font-semibold">{{ t('comments.title') }} ({{ store.total }})</h2>
      <USelect v-model="sort" :items="sortOptions" size="sm" :aria-label="t('comments.sort.label')" />
    </header>

    <div v-if="others.length || typingText" class="flex min-h-5 flex-wrap items-center gap-2 text-xs text-muted" data-thread-presence>
      <template v-if="others.length">
        <div class="flex -space-x-1.5">
          <UserAvatar
            v-for="u in others.slice(0, 5)"
            :key="u.userId"
            :user="{ name: u.userName }"
            size="3xs"
            class="ring-1 ring-default"
          />
        </div>
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
    <CommentForm v-else-if="isLoggedIn" />
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
