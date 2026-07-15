<script setup lang="ts">
import type { ActivityEntry } from '../../shared/types/activity'

const props = defineProps<{
  activity: ActivityEntry
  /** Moderations-Modus: zeigt den Löschen-Button (dashboard/activity) */
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

// Ereignis-Text: activity.types.<type> (z. B. activity.types.comment.created);
// unbekannte Typen fallen auf 'generic' zurück — künftige Ereignis-Typen
// älterer Layer-Stände brechen den Feed nicht.
const messageKey = computed(() => {
  const key = `activity.types.${props.activity.type}`
  return te(key) ? key : 'activity.types.generic'
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

// Kleines Objekt-Icon neben dem Avatar — macht Eintragsarten auf einen Blick
// unterscheidbar; unbekannte objectTypes fallen auf den Puls zurück.
const OBJECT_ICONS: Record<string, string> = {
  comment: 'i-ph-chat-circle',
  user: 'i-ph-user-plus',
  changelog: 'i-ph-megaphone',
  theme: 'i-ph-palette',
  font: 'i-ph-text-aa',
  milestone: 'i-ph-confetti',
  post: 'i-ph-users-three',
}
const objectIcon = computed(() => OBJECT_ICONS[props.activity.objectType] ?? 'i-ph-pulse')

// System-Einträge (Meilensteine): kein User dahinter → Konfetti-Kreis statt
// Avatar, kein Icon-Badge nötig
const isSystem = computed(() => props.activity.actorId === 'system')
</script>

<template>
  <div class="flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-elevated">
    <div v-if="isSystem" class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
      <UIcon name="i-ph-confetti" class="size-4 text-primary" />
    </div>
    <div v-else class="relative shrink-0">
      <UserAvatar :user="{ name: activity.actorName, prefs: { avatarUrl: activity.actorAvatarUrl } }" size="sm" />
      <UIcon :name="objectIcon" class="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-default p-0.5 text-muted" />
    </div>

    <NuxtLink :to="localePath(safeLink)" class="min-w-0 flex-1">
      <i18n-t :keypath="messageKey" tag="p" scope="global" class="text-sm text-muted">
        <template #name><span class="font-medium text-default">{{ activity.actorName || t('activity.someone') }}</span></template>
        <template #count><span class="font-medium text-default">{{ metadata.count ?? '' }}</span></template>
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
      :aria-label="t('activity.delete')"
      @click="emit('remove', activity.$id)"
    />
  </div>
</template>
