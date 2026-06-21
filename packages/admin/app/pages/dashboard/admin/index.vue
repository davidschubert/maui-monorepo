<script setup lang="ts">
import type { Models } from 'node-appwrite'
import type { TableColumn } from '@nuxt/ui'
import type { AuditLogEntry, AuditLogListResponse } from '../../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t, te, locale } = useI18n()
const localePath = useLocalePath()
const config = useRuntimeConfig()
const { formatRelativeTime } = useFormatRelativeTime()
const { page, setPage } = usePagination()

const { data, status, refresh } = useFetch<AuditLogListResponse>('/api/admin/audit', {
  query: computed(() => ({ page: page.value })),
  lazy: true,
  server: false,
})

// Live: neue Audit-Einträge (von anderen Admins) erscheinen ohne Reload.
// Voraussetzung: audit_logs read:label:admin (Migration admin-006).
let liveTimer: ReturnType<typeof setTimeout> | undefined
useRealtimeRows<Models.Row>(config.public.appwriteDatabaseId, 'audit_logs', () => {
  clearTimeout(liveTimer)
  liveTimer = setTimeout(() => { void refresh() }, 400)
})
onScopeDispose(() => clearTimeout(liveTimer))

const ACTION_STYLE: Record<string, { icon: string, color: string }> = {
  'user.login': { icon: 'i-ph-sign-in', color: 'text-success' },
  'user.logout': { icon: 'i-ph-sign-out', color: 'text-muted' },
  'user.block': { icon: 'i-ph-prohibit', color: 'text-error' },
  'user.unblock': { icon: 'i-ph-lock-open', color: 'text-success' },
  'user.sessions_cleared': { icon: 'i-ph-sign-out', color: 'text-warning' },
  'user.role_granted': { icon: 'i-ph-shield-star', color: 'text-primary' },
  'user.role_revoked': { icon: 'i-ph-shield-slash', color: 'text-warning' },
  'user.exported': { icon: 'i-ph-download-simple', color: 'text-muted' },
  'user.deleted': { icon: 'i-ph-trash', color: 'text-error' },
  'comment.hidden': { icon: 'i-ph-eye-slash', color: 'text-error' },
  'comment.restored': { icon: 'i-ph-eye', color: 'text-success' },
  'storage.file_deleted': { icon: 'i-ph-trash', color: 'text-error' },
  'config.updated': { icon: 'i-ph-toggle-left', color: 'text-primary' },
}
function style(action: string) {
  return ACTION_STYLE[action] ?? { icon: 'i-ph-dot-outline', color: 'text-muted' }
}
function actionKey(action: string): string {
  return `admin.audit.action.${action}`
}
function targetLink(entry: AuditLogEntry): string | null {
  return entry.targetType === 'user' && entry.targetId
    ? localePath(`/dashboard/users/${entry.targetId}`)
    : null
}
function displayIp(ip: string): string {
  if (!ip) return '—'
  return ip === '::1' || ip === '127.0.0.1' ? 'localhost' : ip
}
function exactDateTime(iso: string): string {
  return new Date(iso).toLocaleString(locale.value, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

const columns: TableColumn<AuditLogEntry>[] = [
  { accessorKey: 'actorName', header: () => t('admin.audit.col.user') },
  { id: 'event', header: () => t('admin.audit.col.event') },
  { accessorKey: 'ip', header: () => t('admin.audit.col.ip') },
  { id: 'date', header: () => t('admin.audit.col.date') },
]
</script>

<template>
  <ClientOnly>
    <template #fallback>
      <div class="flex justify-center py-16"><UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" /></div>
    </template>

    <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
      <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
    </div>

    <p v-else-if="(data?.entries.length ?? 0) === 0" class="text-sm text-muted">
      {{ t('admin.audit.empty') }}
    </p>

    <template v-else>
      <UTable :data="data?.entries ?? []" :columns="columns">
        <template #actorName-cell="{ row }">
          <ULink :to="localePath(`/dashboard/users/${row.original.actorId}`)" class="flex items-center gap-2 font-medium text-default hover:text-primary">
            <UserAvatar :user="{ name: row.original.actorName, prefs: { avatarUrl: row.original.actorAvatarUrl } }" size="2xs" />
            <span class="hover:underline">{{ row.original.actorName }}</span>
          </ULink>
        </template>
        <template #event-cell="{ row }">
          <div class="flex items-center gap-2">
            <UIcon :name="style(row.original.action).icon" :class="style(row.original.action).color" class="size-4 shrink-0" />
            <span v-if="!te(actionKey(row.original.action))">{{ row.original.action }}</span>
            <i18n-t v-else :keypath="actionKey(row.original.action)" tag="span" scope="global">
              <template #name>
                <ULink v-if="targetLink(row.original)" :to="targetLink(row.original)!" class="font-medium text-primary hover:underline">{{ row.original.targetName || row.original.targetId }}</ULink>
                <span v-else class="font-medium">{{ row.original.targetName || row.original.targetId }}</span>
              </template>
            </i18n-t>
          </div>
        </template>
        <template #ip-cell="{ row }">
          <span class="font-mono text-muted">{{ displayIp(row.original.ip) }}</span>
        </template>
        <template #date-cell="{ row }">
          <span class="whitespace-nowrap">
            {{ formatRelativeTime(row.original.$createdAt) }}
            <span class="text-dimmed">({{ exactDateTime(row.original.$createdAt) }})</span>
          </span>
        </template>
      </UTable>

      <UPagination
        v-if="(data?.total ?? 0) > 30"
        class="mt-4"
        :page="page"
        :total="data?.total ?? 0"
        :items-per-page="30"
        @update:page="setPage"
      />
    </template>
  </ClientOnly>
</template>
