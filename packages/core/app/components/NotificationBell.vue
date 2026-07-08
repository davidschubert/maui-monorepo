<script setup lang="ts">
import type { Models } from 'node-appwrite'
import type { NotificationListResponse, UserNotification } from '../../shared/types/notification'

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const config = useRuntimeConfig()
const { formatRelativeTime } = useFormatRelativeTime()

const notifications = ref<UserNotification[]>([])
const unread = ref(0)
const open = ref(false)

async function load() {
  try {
    const res = await $fetch<NotificationListResponse>('/api/notifications')
    notifications.value = res.notifications
    unread.value = res.unread
  }
  catch {
    // ignorieren — Bell bleibt leer
  }
}

// Realtime: neue Benachrichtigung für mich → sofort einblenden. Einmal abonniert;
// der where-Filter liest die User-ID dynamisch, damit auch ein Login NACH Mount
// greift (uid beim Subscribe zu fixieren würde sonst leer bleiben).
let stop: (() => void) | undefined
onMounted(() => {
  stop = useRealtimeRows<Models.Row & UserNotification>(
    config.public.appwriteDatabaseId,
    'notifications',
    (ev) => {
      if (ev.type !== 'create') return
      // Dedupe gegen das parallel laufende load(): enthielt dessen Antwort den
      // Eintrag schon, würde er sonst doppelt gelistet UND doppelt gezählt.
      if (notifications.value.some(n => n.$id === ev.payload.$id)) return
      notifications.value = [ev.payload, ...notifications.value]
      unread.value++
    },
    { where: payload => payload.recipientId === auth.user?.$id },
  )
})
onBeforeUnmount(() => stop?.())

// Bei (Re-)Login Notifications laden, bei Logout leeren — deckt auch den Fall ab,
// dass der Login erst nach dem Mount der Bell passiert.
watch(() => auth.user?.$id, (uid) => {
  if (uid) {
    load()
  }
  else {
    notifications.value = []
    unread.value = 0
  }
}, { immediate: true })

async function markAllRead() {
  if (unread.value === 0) return
  unread.value = 0
  notifications.value = notifications.value.map(n => ({ ...n, read: true }))
  try {
    await $fetch('/api/notifications/read', { method: 'POST' })
  }
  catch {
    // optimistisch — nächster Load korrigiert
  }
}

function onToggle(value: boolean) {
  open.value = value
  if (value) markAllRead()
}

// Defense-in-depth gegen Open-Redirect: nur interne absolute Pfade durchlassen
// (gleicher Guard wie das targetUrl-Schema), sonst auf '/' zurückfallen. Schützt
// auch vor evtl. alt gespeicherten/vergifteten Notification-Links.
function safeLink(link?: string): string {
  return link && /^\/(?![/\\%])[^\s\\]*$/.test(link) ? link : '/'
}

// Nachrichtentext je Notification-Typ; unbekannte Typen fallen auf 'replied'
// zurück (alt gespeicherte Rows / künftige Typen brechen die Bell nicht).
// 'reminder' ist generisch (Termin-/Fristen-Erinnerung, {name} = Betreff) —
// erster Konsument: events (Phase 27).
function messageKey(type: string): string {
  if (type === 'mention') return 'notifications.mentioned'
  if (type === 'reminder') return 'notifications.reminder'
  return 'notifications.replied'
}
</script>

<template>
  <UPopover :open="open" @update:open="onToggle">
    <UChip :show="unread > 0" :text="unread > 9 ? '9+' : unread" color="error" size="3xl">
      <UButton icon="i-ph-bell" color="neutral" variant="ghost" :aria-label="t('notifications.title')" />
    </UChip>

    <template #content>
      <div class="max-h-96 w-80 overflow-y-auto p-1">
        <p class="px-2 py-1.5 text-sm font-semibold">{{ t('notifications.title') }}</p>

        <p v-if="notifications.length === 0" class="px-2 py-8 text-center text-sm text-muted">
          {{ t('notifications.empty') }}
        </p>

        <NuxtLink
          v-for="n in notifications"
          :key="n.$id"
          :to="localePath(safeLink(n.link))"
          class="block rounded-md px-2 py-2 transition-colors hover:bg-elevated"
          @click="open = false"
        >
          <div class="flex items-center gap-1.5">
            <span class="size-1.5 shrink-0 rounded-full" :class="n.read ? 'bg-transparent' : 'bg-primary'" />
            <i18n-t :keypath="messageKey(n.type)" tag="p" scope="global" class="truncate text-sm text-muted">
              <template #name><span class="font-medium text-default">{{ n.title }}</span></template>
            </i18n-t>
          </div>
          <p class="truncate pl-3 text-xs text-muted">{{ n.body }}</p>
          <p class="pl-3 text-xs text-dimmed">{{ formatRelativeTime(n.$createdAt) }}</p>
        </NuxtLink>
      </div>
    </template>
  </UPopover>
</template>
