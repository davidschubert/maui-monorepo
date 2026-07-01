<script setup lang="ts">
import type { Models } from 'node-appwrite'
import type {
  AdminAnalytics,
  AdminCommentListResponse,
  AdminStats,
  AuditLogEntry,
  AuditLogListResponse,
  StorageOverview,
} from '../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t, te, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const config = useRuntimeConfig()
const auth = useAuthStore()
const { formatRelativeTime } = useFormatRelativeTime()

const firstName = computed(() => auth.user?.name?.split(' ')[0] || t('ui.account'))
// Datum erst clientseitig füllen: SSR rendert in der Server-TZ, der Client in
// der lokalen — um Mitternacht/über TZ-Grenzen liefe das auseinander und löste
// einen Hydration-Mismatch aus.
const today = ref('')
onMounted(() => {
  today.value = new Date().toLocaleDateString(locale.value, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
})

// --- Kennzahlen + Chart (SSR) -------------------------------------------------
const { data: stats, refresh: refreshStats } = await useFetch<AdminStats>('/api/admin/stats')

const days = ref(30)
const { data: analytics, refresh: refreshAnalytics } = await useFetch<AdminAnalytics>('/api/admin/analytics', {
  query: computed(() => ({ days: days.value })),
})

const cards = computed(() => [
  { label: t('admin.stats.users'), value: stats.value?.usersTotal ?? 0, delta: analytics.value?.usersInRange ?? 0, icon: 'i-ph-users', to: localePath('/dashboard/users') },
  { label: t('admin.stats.comments'), value: stats.value?.commentsTotal ?? 0, delta: analytics.value?.commentsInRange ?? 0, icon: 'i-ph-chat-circle', to: localePath('/dashboard/comments') },
  { label: t('admin.stats.reported'), value: stats.value?.commentsReported ?? 0, delta: 0, icon: 'i-ph-flag', to: localePath({ path: '/dashboard/comments', query: { status: 'reported' } }) },
])

// --- Online-Presence (live) ---------------------------------------------------
interface OnlineUser { userId: string, userName: string, avatarUrl: string }
const { data: presence, refresh: refreshPresence } = await useFetch<{ count: number, users: OnlineUser[] }>('/api/presence/count', {
  query: { scope: 'global' },
})
const onlineCount = computed(() => presence.value?.count ?? 0)
const onlineUsers = computed(() => presence.value?.users ?? [])
// Live-Anwesenheit über die Presences API (Channel.presences()) — treibt den
// entprellten Reload der serverseitigen Zählung (inkl. Avatare, s.u.).
const { present } = usePresence()

// --- Widgets (client-seitig, blockiert SSR nicht) -----------------------------
const { data: reported, refresh: refreshReported } = useFetch<AdminCommentListResponse>('/api/admin/comments', {
  query: { status: 'reported', page: 1 }, lazy: true, server: false,
})
const reportedList = computed(() => (reported.value?.comments ?? []).slice(0, 5))

const { data: audit, refresh: refreshAudit } = useFetch<AuditLogListResponse>('/api/admin/audit', {
  query: { page: 1 }, lazy: true, server: false,
})
const auditList = computed(() => (audit.value?.entries ?? []).slice(0, 6))

const { data: storage } = useFetch<StorageOverview>('/api/admin/storage', { lazy: true, server: false })

function actionText(entry: AuditLogEntry): string {
  const key = `admin.audit.action.${entry.action}`
  return te(key) ? t(key, { name: entry.targetName || entry.targetId }) : entry.action
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// --- Schnellmoderation aus dem "Zu moderieren"-Widget -------------------------
const busyId = ref<string | null>(null)
async function moderate(id: string, status: 'hidden' | 'active') {
  busyId.value = id
  try {
    await $fetch(`/api/admin/comments/${id}/status`, { method: 'PATCH', body: { status } })
    toast.add({ title: t(status === 'hidden' ? 'admin.moderation.hidden' : 'admin.moderation.restored'), color: 'success' })
    await Promise.all([refreshReported(), refreshStats()])
  }
  catch {
    toast.add({ title: t('admin.users.actionFailed'), color: 'error' })
  }
  finally {
    busyId.value = null
  }
}

// --- Realtime: alles Relevante live nachziehen --------------------------------
const rangeItems = computed(() => [7, 30, 90].map(d => ({ label: t('admin.analytics.subtitle', { days: d }), value: d })))

let commentsTimer: ReturnType<typeof setTimeout> | undefined
let presenceTimer: ReturnType<typeof setTimeout> | undefined
let auditTimer: ReturnType<typeof setTimeout> | undefined
let presencePoll: ReturnType<typeof setInterval> | undefined

useRealtimeRows<Models.Row>(config.public.appwriteDatabaseId, 'comments', () => {
  clearTimeout(commentsTimer)
  commentsTimer = setTimeout(() => { void refreshStats(); void refreshAnalytics(); void refreshReported() }, 500)
})
watch(present, () => {
  clearTimeout(presenceTimer)
  presenceTimer = setTimeout(() => { void refreshPresence() }, 500)
})
useRealtimeRows<Models.Row>(config.public.appwriteDatabaseId, 'audit_logs', () => {
  clearTimeout(auditTimer)
  auditTimer = setTimeout(() => { void refreshAudit() }, 500)
})
onMounted(() => { presencePoll = setInterval(() => { void refreshPresence() }, 30_000) })

onScopeDispose(() => {
  clearTimeout(commentsTimer)
  clearTimeout(presenceTimer)
  clearTimeout(auditTimer)
  clearInterval(presencePoll)
})
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <UDashboardNavbar :title="t('admin.nav.overview')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full flex-col gap-4 sm:gap-6 lg:max-w-5xl">
        <!-- Begrüßung -->
        <div>
          <h1 class="text-xl font-semibold">{{ t('admin.overview.greeting', { name: firstName }) }}</h1>
          <p class="text-sm text-muted">{{ today }}</p>
        </div>

        <!-- Online -->
        <UCard data-online-card>
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <span class="relative flex size-2.5">
                <span class="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                <span class="relative inline-flex size-2.5 rounded-full bg-success" />
              </span>
              <span class="text-sm"><span class="text-lg font-bold tabular-nums">{{ onlineCount }}</span> {{ t('admin.stats.online') }}</span>
            </div>
            <UAvatarGroup v-if="onlineUsers.length" :max="8" size="sm">
              <UTooltip v-for="u in onlineUsers" :key="u.userId" :text="u.userName">
                <UserAvatar :user="{ name: u.userName, prefs: { avatarUrl: u.avatarUrl } }" size="sm" />
              </UTooltip>
            </UAvatarGroup>
          </div>
        </UCard>

        <!-- KPIs -->
        <div class="grid gap-4 sm:grid-cols-3" data-stat-cards>
          <UCard v-for="card in cards" :key="card.label">
            <NuxtLink :to="card.to" class="flex items-center gap-3">
              <UIcon :name="card.icon" class="size-8 shrink-0 text-primary" />
              <div class="min-w-0">
                <p class="text-2xl font-bold tabular-nums">{{ card.value }}</p>
                <p class="truncate text-sm text-muted">{{ card.label }}</p>
                <p v-if="card.delta > 0" class="text-xs text-success">{{ t('admin.overview.delta', { count: card.delta, days }) }}</p>
              </div>
            </NuxtLink>
          </UCard>
        </div>

        <!-- Chart -->
        <UCard v-if="analytics">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-semibold">{{ t('admin.analytics.title') }}</h2>
              <USelect v-model="days" :items="rangeItems" size="sm" class="w-40" />
            </div>
          </template>

          <AnalyticsTrendChart
            :points="analytics.points"
            :users-label="t('admin.analytics.users')"
            :comments-label="t('admin.analytics.comments')"
            :users-total="analytics.usersInRange"
            :comments-total="analytics.commentsInRange"
            :today-label="t('admin.analytics.today')"
          />
        </UCard>

        <!-- Zu moderieren + Letzte Aktivität -->
        <div class="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <h2 class="flex items-center gap-2 font-semibold">
                  {{ t('admin.overview.moderate') }}
                  <UBadge v-if="reported?.total" color="warning" variant="subtle" size="sm">{{ reported.total }}</UBadge>
                </h2>
                <ULink :to="localePath({ path: '/dashboard/comments', query: { status: 'reported' } })" class="text-sm text-primary hover:underline">{{ t('admin.overview.viewAll') }}</ULink>
              </div>
            </template>
            <p v-if="!reportedList.length" class="text-sm text-muted">{{ t('admin.overview.allClear') }}</p>
            <ul v-else class="space-y-3">
              <li v-for="c in reportedList" :key="c.$id" class="border-b border-default/60 pb-3 text-sm last:border-0 last:pb-0">
                <div class="mb-1 flex items-center gap-2 text-xs text-muted">
                  <ULink :to="localePath(`/dashboard/users/${c.authorId}`)" class="font-medium text-default hover:text-primary hover:underline">{{ c.authorName }}</ULink>
                  <span>·</span>
                  <span>{{ formatRelativeTime(c.$createdAt) }}</span>
                </div>
                <p class="line-clamp-2 whitespace-pre-line">{{ c.content }}</p>
                <div class="mt-1.5 flex gap-1">
                  <UButton size="xs" color="error" variant="ghost" icon="i-ph-eye-slash" :loading="busyId === c.$id" @click="moderate(c.$id, 'hidden')">{{ t('admin.moderation.hide') }}</UButton>
                  <UButton size="xs" color="success" variant="ghost" icon="i-ph-eye" :loading="busyId === c.$id" @click="moderate(c.$id, 'active')">{{ t('admin.moderation.restore') }}</UButton>
                </div>
              </li>
            </ul>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <h2 class="font-semibold">{{ t('admin.overview.recentActivity') }}</h2>
                <ULink :to="localePath('/dashboard/admin')" class="text-sm text-primary hover:underline">{{ t('admin.overview.viewAll') }}</ULink>
              </div>
            </template>
            <p v-if="!auditList.length" class="text-sm text-muted">—</p>
            <ul v-else class="space-y-2.5">
              <li v-for="e in auditList" :key="e.$id" class="flex items-center gap-2 text-sm">
                <UserAvatar :user="{ name: e.actorName, prefs: { avatarUrl: e.actorAvatarUrl } }" size="2xs" />
                <span class="min-w-0 flex-1 truncate"><span class="font-medium">{{ e.actorName }}</span> {{ actionText(e) }}</span>
                <span class="shrink-0 text-xs text-dimmed">{{ formatRelativeTime(e.$createdAt) }}</span>
              </li>
            </ul>
          </UCard>
        </div>

        <!-- Speicher -->
        <UCard v-if="storage?.available">
          <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
            <h2 class="font-semibold">{{ t('admin.overview.storage') }}</h2>
            <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-muted">
              <span>{{ t('admin.storage.files') }}: <span class="font-bold text-default tabular-nums">{{ storage.files.length }}</span></span>
              <span>{{ t('admin.storage.size') }}: <span class="font-bold text-default tabular-nums">{{ formatBytes(storage.totalBytes) }}</span></span>
              <span>{{ t('admin.storage.orphans') }}: <span class="font-bold text-default tabular-nums">{{ storage.orphanCount }}</span></span>
              <ULink :to="localePath('/dashboard/storage')" class="text-primary hover:underline">{{ t('admin.overview.viewAll') }}</ULink>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
