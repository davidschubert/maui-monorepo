<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AuditLogEntry, AuditLogListResponse } from '../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { formatRelativeTime } = useFormatRelativeTime()
const { page, setPage } = usePagination()

function exactDateTime(iso: string): string {
  return new Date(iso).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
}

const { data, status } = useFetch<AuditLogListResponse>('/api/admin/audit', {
  query: computed(() => ({ page: page.value })),
  lazy: true,
  server: false,
})

const ACTION_STYLE: Record<string, { icon: string, color: string }> = {
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
function actionLabel(entry: AuditLogEntry): string {
  const key = `admin.audit.action.${entry.action}`
  const label = t(key, { name: entry.targetName || entry.targetId || '?' })
  return label === key ? entry.action : label
}
function targetLink(entry: AuditLogEntry): string | null {
  return entry.targetType === 'user' && entry.targetId
    ? localePath(`/dashboard/users/${entry.targetId}`)
    : null
}

const columns: TableColumn<AuditLogEntry>[] = [
  { accessorKey: 'actorName', header: () => t('admin.audit.col.user') },
  { id: 'event', header: () => t('admin.audit.col.event') },
  { accessorKey: 'ip', header: () => t('admin.audit.col.ip') },
  { id: 'date', header: () => t('admin.audit.col.date') },
]
</script>

<template>
  <UDashboardPanel id="audit">
    <template #header>
      <UDashboardNavbar :title="`${t('admin.audit.title')} (${data?.total ?? 0})`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
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
              <span class="font-medium">{{ row.original.actorName }}</span>
            </template>
            <template #event-cell="{ row }">
              <div class="flex items-center gap-2">
                <UIcon :name="style(row.original.action).icon" :class="style(row.original.action).color" class="size-4 shrink-0" />
                <span>{{ actionLabel(row.original) }}</span>
                <ULink v-if="targetLink(row.original)" :to="targetLink(row.original)!" class="text-xs text-primary hover:underline">↗</ULink>
              </div>
            </template>
            <template #ip-cell="{ row }">
              <span class="font-mono text-muted">{{ row.original.ip || '—' }}</span>
            </template>
            <template #date-cell="{ row }">
              <span class="whitespace-nowrap">
                {{ formatRelativeTime(row.original.$createdAt) }}
                <span class="text-muted">({{ exactDateTime(row.original.$createdAt) }})</span>
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
  </UDashboardPanel>
</template>
