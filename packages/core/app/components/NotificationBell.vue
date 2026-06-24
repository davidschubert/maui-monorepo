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

let stop: (() => void) | undefined
onMounted(() => {
  load()
  const uid = auth.user?.$id
  if (!uid) return
  // Realtime: neue Benachrichtigung für mich → sofort einblenden
  stop = useRealtimeRows<Models.Row & UserNotification>(
    config.public.appwriteDatabaseId,
    'notifications',
    (ev) => {
      if (ev.type !== 'create') return
      notifications.value = [ev.payload, ...notifications.value]
      unread.value++
    },
    { where: payload => payload.recipientId === uid },
  )
})
onBeforeUnmount(() => stop?.())

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
          :to="localePath(n.link || '/')"
          class="block rounded-md px-2 py-2 transition-colors hover:bg-elevated"
          @click="open = false"
        >
          <div class="flex items-center gap-1.5">
            <span class="size-1.5 shrink-0 rounded-full" :class="n.read ? 'bg-transparent' : 'bg-primary'" />
            <i18n-t keypath="notifications.replied" tag="p" scope="global" class="truncate text-sm text-muted">
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
