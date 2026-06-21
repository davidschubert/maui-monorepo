<script setup lang="ts">
import { COMMENTS_TABLE, type Comment, type SortMode } from '../../shared/types/comment'

const props = defineProps<{
  targetId: string
  targetType: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const store = useCommentStore()
const config = useRuntimeConfig()
const { isLoggedIn } = useCurrentUser()

// Kommentar-Policy aus den Laufzeit-Flags bereitstellen (synchron, vor await).
// Refs auf Top-Level holen — verschachtelte Refs (policy.canWrite) unwrappen im
// Template NICHT automatisch.
const { policy, flags: flagsAsync } = provideCommentPolicy()
const { canWrite, reason } = policy

const notice = computed(() => reason.value === 'maintenance'
  ? { title: t('comments.disabled.maintenanceTitle'), text: t('comments.disabled.maintenanceText') }
  : { title: t('comments.disabled.title'), text: t('comments.disabled.text') })

// SSR-Load — Pinia-State hydratisiert in den Client; Flags parallel auflösen
await useAsyncData(`comments:${props.targetType}:${props.targetId}`, async () => {
  await store.fetchComments(props.targetId, props.targetType)
  return true
})
await flagsAsync

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
</script>

<template>
  <section class="space-y-4" data-comment-section>
    <header class="flex items-center justify-between gap-4">
      <h2 class="text-lg font-semibold">{{ t('comments.title') }} ({{ store.total }})</h2>
      <USelect v-model="sort" :items="sortOptions" size="sm" :aria-label="t('comments.sort.label')" />
    </header>

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
  </section>
</template>
