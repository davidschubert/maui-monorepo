<script setup lang="ts">
import type { FeedActivity } from '../../shared/types/activity'

const props = defineProps<{
  activity: FeedActivity
  /** Moderations-Modus: zeigt den Löschen-Button (dashboard/feed) */
  moderate?: boolean
}>()

const emit = defineEmits<{ remove: [id: string] }>()

const { t, te } = useI18n()
const localePath = useLocalePath()
const { formatRelativeTime } = useFormatRelativeTime()

// Defense-in-depth gegen Open-Redirect: nur interne absolute Pfade durchlassen
// (gleicher Guard wie die NotificationBell), sonst auf '/' zurückfallen.
const safeLink = computed(() => {
  const link = props.activity.link
  return link && /^\/(?![/\\%])[^\s\\]*$/.test(link) ? link : '/'
})

// Ereignis-Text: feed.types.<type> (z. B. feed.types.comment.created);
// unbekannte Typen fallen auf 'generic' zurück — künftige Ereignis-Typen
// älterer Layer-Stände brechen den Feed nicht.
const messageKey = computed(() => {
  const key = `feed.types.${props.activity.type}`
  return te(key) ? key : 'feed.types.generic'
})

// Kleine Zusatzdaten (z. B. snippet) — defensiv geparst, kein Vertrauen in die Row
const metadata = computed<Record<string, unknown>>(() => {
  if (!props.activity.metadata) return {}
  try {
    const parsed: unknown = JSON.parse(props.activity.metadata)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  }
  catch {
    return {}
  }
})

const snippet = computed(() => typeof metadata.value.snippet === 'string' ? metadata.value.snippet : '')
</script>

<template>
  <div class="flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-elevated">
    <UserAvatar :user="{ name: activity.actorName, prefs: { avatarUrl: activity.actorAvatarUrl } }" size="sm" />

    <NuxtLink :to="localePath(safeLink)" class="min-w-0 flex-1">
      <i18n-t :keypath="messageKey" tag="p" scope="global" class="text-sm text-muted">
        <template #name><span class="font-medium text-default">{{ activity.actorName || t('feed.someone') }}</span></template>
      </i18n-t>
      <p v-if="snippet" class="truncate text-xs text-muted">{{ snippet }}</p>
      <p class="text-xs text-dimmed">{{ formatRelativeTime(activity.$createdAt) }}</p>
    </NuxtLink>

    <UButton
      v-if="moderate"
      icon="i-ph-trash"
      color="error"
      variant="ghost"
      size="xs"
      :aria-label="t('feed.delete')"
      @click="emit('remove', activity.$id)"
    />
  </div>
</template>
