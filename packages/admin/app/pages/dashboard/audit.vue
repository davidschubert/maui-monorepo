<script setup lang="ts">
import type { AuditLogEntry, AuditLogListResponse } from '../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
const localePath = useLocalePath()
const { formatRelativeTime } = useFormatRelativeTime()
const { page, setPage } = usePagination()

// Admin-Daten ohne SEO-Relevanz + relative Zeiten → client-seitig laden
// (sonst Hydration-Mismatch auf "vor X Sekunden").
const { data, status } = useFetch<AuditLogListResponse>('/api/admin/audit', {
  query: computed(() => ({ page: page.value })),
  lazy: true,
  server: false,
})

/** Icon + Farbe je Aktion; Fallback für künftige Aktionen */
const ACTION_STYLE: Record<string, { icon: string, color: string }> = {
  'user.block': { icon: 'i-ph-prohibit', color: 'text-error' },
  'user.unblock': { icon: 'i-ph-lock-open', color: 'text-success' },
  'user.sessions_cleared': { icon: 'i-ph-sign-out', color: 'text-warning' },
  'comment.hidden': { icon: 'i-ph-eye-slash', color: 'text-error' },
  'comment.restored': { icon: 'i-ph-eye', color: 'text-success' },
}
function style(action: string) {
  return ACTION_STYLE[action] ?? { icon: 'i-ph-dot-outline', color: 'text-muted' }
}
function actionLabel(action: string): string {
  const key = `admin.audit.action.${action}`
  const label = t(key)
  return label === key ? action : label
}

/** Ziel-Link: User → Detailseite, sonst kein Link */
function targetLink(entry: AuditLogEntry): string | null {
  return entry.targetType === 'user' && entry.targetId
    ? localePath(`/dashboard/users/${entry.targetId}`)
    : null
}
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
          <div class="flex justify-center py-16">
            <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
          </div>
        </template>

        <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
          <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
        </div>

        <p v-else-if="(data?.entries.length ?? 0) === 0" class="text-sm text-muted">
          {{ t('admin.audit.empty') }}
        </p>

        <ul v-else class="divide-y divide-default">
        <li v-for="entry in data?.entries" :key="entry.$id" class="flex items-start gap-3 py-3">
          <UIcon :name="style(entry.action).icon" :class="style(entry.action).color" class="mt-0.5 size-5 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="text-sm">
              <span class="font-medium">{{ entry.actorName }}</span>
              <span class="text-muted"> · {{ actionLabel(entry.action) }}</span>
            </p>
            <p v-if="entry.targetName || entry.targetId" class="truncate text-xs text-muted">
              <ULink v-if="targetLink(entry)" :to="targetLink(entry)!" class="hover:text-primary hover:underline">
                {{ entry.targetName || entry.targetId }}
              </ULink>
              <span v-else>{{ entry.targetName || entry.targetId }}</span>
            </p>
          </div>
          <time class="shrink-0 text-xs text-muted" :title="formatDate(entry.$createdAt)">
            {{ formatRelativeTime(entry.$createdAt) }}
          </time>
        </li>
      </ul>

        <UPagination
          v-if="(data?.total ?? 0) > 30"
          class="mt-4"
          :page="page"
          :total="data?.total ?? 0"
          :items-per-page="30"
          @update:page="setPage"
        />
      </ClientOnly>
    </template>
  </UDashboardPanel>
</template>
