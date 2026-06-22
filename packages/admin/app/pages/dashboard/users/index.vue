<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { AdminUserListResponse, AdminUserRow } from '../../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
const { formatRelativeTime } = useFormatRelativeTime()
const localePath = useLocalePath()
const toast = useToast()
const auth = useAuthStore()
const { user: me } = useCurrentUser()

const search = ref('')
const activeSearch = ref('')
const { page, setPage } = usePagination()
const { sortField, sortDir, toggle } = useTableSort('$createdAt', 'desc')

const { data, refresh } = await useFetch<AdminUserListResponse>('/api/admin/users', {
  query: computed(() => ({ search: activeSearch.value, page: page.value, sort: sortField.value, dir: sortDir.value })),
})

// Sortierwechsel → zurück auf Seite 1
watch([sortField, sortDir], () => setPage(1))

function runSearch() {
  activeSearch.value = search.value.trim()
  setPage(1)
}

const columns: TableColumn<AdminUserRow>[] = [
  { accessorKey: 'name', header: () => t('admin.users.name') },
  { accessorKey: 'email', header: () => t('admin.users.email') },
  { accessorKey: '$createdAt', header: () => t('admin.users.joined'), id: 'createdAt' },
  { accessorKey: 'accessedAt', header: () => t('admin.users.lastActivity'), id: 'lastActivity' },
  { id: 'active', header: () => t('admin.users.activeNow') },
  { accessorKey: 'emailVerification', header: () => t('admin.users.verified'), id: 'verified' },
  { accessorKey: 'status', header: () => t('admin.users.status'), id: 'status' },
  { accessorKey: 'labels', header: () => t('admin.users.labels'), id: 'labels' },
  { id: 'actions', header: () => '' },
]

const pending = ref<{ type: 'block' | 'unblock' | 'sessions' | 'grant' | 'revoke' | 'delete', user: AdminUserRow } | null>(null)
const busy = ref(false)
const exportingId = ref<string | null>(null)

const confirmText = computed(() => {
  if (!pending.value) return ''
  return t(`admin.users.confirm.${pending.value.type}`, { name: pending.value.user.name })
})

async function exportUser(user: AdminUserRow) {
  exportingId.value = user.$id
  try {
    const payload = await $fetch(`/api/admin/users/${user.$id}/export`)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `user-${user.$id}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  catch {
    toast.add({ title: t('admin.users.actionFailed'), color: 'error' })
  }
  finally {
    exportingId.value = null
  }
}

function rowActions(user: AdminUserRow): DropdownMenuItem[][] {
  const isSelf = user.$id === me.value?.$id
  const isAdmin = user.labels.includes('admin')
  return [
    [
      user.status
        ? { label: t('admin.users.block'), icon: 'i-ph-prohibit', color: 'error', disabled: isSelf, onSelect: () => { pending.value = { type: 'block', user } } }
        : { label: t('admin.users.unblock'), icon: 'i-ph-lock-open', color: 'success', onSelect: () => { pending.value = { type: 'unblock', user } } },
      { label: t('admin.users.clearSessions'), icon: 'i-ph-sign-out', onSelect: () => { pending.value = { type: 'sessions', user } } },
      isAdmin
        ? { label: t('admin.users.revokeAdmin'), icon: 'i-ph-shield-slash', disabled: isSelf, onSelect: () => { pending.value = { type: 'revoke', user } } }
        : { label: t('admin.users.makeAdmin'), icon: 'i-ph-shield-star', onSelect: () => { pending.value = { type: 'grant', user } } },
      { label: t('admin.users.export'), icon: 'i-ph-download-simple', onSelect: () => exportUser(user) },
    ],
    [
      { label: t('admin.users.deleteUser'), icon: 'i-ph-trash', color: 'error', disabled: isSelf, onSelect: () => { pending.value = { type: 'delete', user } } },
    ],
  ]
}

async function executePending() {
  if (!pending.value) return
  busy.value = true
  const { type, user } = pending.value
  try {
    if (type === 'sessions') {
      const result = await $fetch<{ ok: boolean, self: boolean }>(`/api/admin/users/${user.$id}/sessions`, { method: 'DELETE' })
      toast.add({ title: t('admin.users.sessionsCleared'), color: 'success' })
      if (result.self) {
        pending.value = null
        auth.setUser(null)
        await navigateTo(localePath('/'))
        return
      }
    }
    else if (type === 'grant' || type === 'revoke') {
      await $fetch(`/api/admin/users/${user.$id}/role`, { method: 'PATCH', body: { admin: type === 'grant' } })
      toast.add({ title: t(type === 'grant' ? 'admin.users.roleGranted' : 'admin.users.roleRevoked'), color: 'success' })
    }
    else if (type === 'delete') {
      await $fetch(`/api/admin/users/${user.$id}`, { method: 'DELETE' })
      toast.add({ title: t('admin.users.deleted'), color: 'success' })
    }
    else {
      await $fetch(`/api/admin/users/${user.$id}/status`, { method: 'PATCH', body: { blocked: type === 'block' } })
      toast.add({ title: t(type === 'block' ? 'admin.users.blocked' : 'admin.users.unblocked'), color: 'success' })
    }
    pending.value = null
    await refresh()
  }
  catch (error) {
    const code = (error as { data?: { data?: { code?: string } } })?.data?.data?.code
    toast.add({ title: code === 'last_admin' ? t('admin.users.lastAdmin') : t('admin.users.actionFailed'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <UDashboardNavbar :title="`${t('admin.nav.users')} (${data?.total ?? 0})`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <form class="mb-4 flex max-w-md gap-2" @submit.prevent="runSearch">
        <UInput v-model="search" icon="i-ph-magnifying-glass" :placeholder="t('admin.users.searchPlaceholder')" class="flex-1" />
        <UButton type="submit" color="neutral" variant="subtle">{{ t('admin.users.search') }}</UButton>
      </form>

      <ClientOnly>
        <template #fallback>
          <div class="flex justify-center py-16"><UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" /></div>
        </template>
      <UTable :data="data?.users ?? []" :columns="columns" data-users-table>
        <template #name-header>
          <SortableHeader :label="t('admin.users.name')" field="name" :active="sortField" :dir="sortDir" @toggle="toggle" />
        </template>
        <template #email-header>
          <SortableHeader :label="t('admin.users.email')" field="email" :active="sortField" :dir="sortDir" @toggle="toggle" />
        </template>
        <template #createdAt-header>
          <SortableHeader :label="t('admin.users.joined')" field="$createdAt" :active="sortField" :dir="sortDir" @toggle="toggle" />
        </template>
        <template #active-header>
          <SortableHeader :label="t('admin.users.activeNow')" field="active" :active="sortField" :dir="sortDir" @toggle="toggle" />
        </template>
        <template #verified-header>
          <SortableHeader :label="t('admin.users.verified')" field="emailVerification" :active="sortField" :dir="sortDir" @toggle="toggle" />
        </template>
        <template #status-header>
          <SortableHeader :label="t('admin.users.status')" field="status" :active="sortField" :dir="sortDir" @toggle="toggle" />
        </template>
        <template #labels-header>
          <SortableHeader :label="t('admin.users.labels')" field="labels" :active="sortField" :dir="sortDir" @toggle="toggle" />
        </template>
        <template #name-cell="{ row }">
          <ULink :to="localePath(`/dashboard/users/${row.original.$id}`)" class="flex items-center gap-2 font-medium text-default hover:text-primary">
            <UChip :show="row.original.online" color="success" position="bottom-right" :ui="{ base: 'ring-2 ring-default' }">
              <UserAvatar :user="{ name: row.original.name, email: row.original.email, prefs: { avatarUrl: row.original.avatarUrl } }" size="xs" />
            </UChip>
            <span class="hover:underline">{{ row.original.name }}</span>
          </ULink>
        </template>
        <template #active-cell="{ row }">
          <span v-if="row.original.online" class="inline-flex items-center gap-1.5 text-sm">
            <span class="size-2 rounded-full bg-success" />
            {{ t('admin.users.online') }}
          </span>
          <span v-else-if="row.original.lastSeen" :title="formatDate(row.original.lastSeen)" class="text-sm text-muted">
            {{ formatRelativeTime(row.original.lastSeen) }}
          </span>
          <span v-else class="text-muted">—</span>
        </template>
        <template #createdAt-cell="{ row }">
          <span :title="formatDate(row.original.$createdAt)">{{ formatRelativeTime(row.original.$createdAt) }}</span>
        </template>
        <template #lastActivity-cell="{ row }">
          <span v-if="row.original.accessedAt" :title="formatDate(row.original.accessedAt)">
            {{ formatRelativeTime(row.original.accessedAt) }}
          </span>
          <span v-else class="text-muted">—</span>
        </template>
        <template #verified-cell="{ row }">
          <div class="flex flex-wrap gap-1">
            <UBadge v-if="row.original.emailVerification" color="success" variant="subtle" size="sm" icon="i-ph-envelope-simple">{{ t('admin.users.verifiedEmail') }}</UBadge>
            <UBadge v-if="row.original.phoneVerification" color="success" variant="subtle" size="sm" icon="i-ph-phone">{{ t('admin.users.verifiedPhone') }}</UBadge>
            <span v-if="!row.original.emailVerification && !row.original.phoneVerification" class="text-muted">—</span>
          </div>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="row.original.status ? 'success' : 'error'" variant="subtle">
            {{ row.original.status ? t('admin.users.active') : t('admin.users.blockedBadge') }}
          </UBadge>
        </template>
        <template #labels-cell="{ row }">
          <div class="flex gap-1">
            <UBadge v-for="label in row.original.labels" :key="label" color="primary" variant="subtle">{{ label }}</UBadge>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
              <UButton icon="i-ph-dots-three-vertical" color="neutral" variant="ghost" size="xs" :loading="exportingId === row.original.$id" />
            </UDropdownMenu>
          </div>
        </template>
      </UTable>

      <UPagination
        v-if="(data?.total ?? 0) > 25"
        class="mt-4"
        :page="page"
        :total="data?.total ?? 0"
        :items-per-page="25"
        @update:page="setPage"
      />
      </ClientOnly>

      <UModal :open="pending !== null" :title="t('admin.users.confirmTitle')" @update:open="(value: boolean) => { if (!value) pending = null }">
        <template #body>
          <p class="text-sm">{{ confirmText }}</p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="pending = null">{{ t('comments.item.cancel') }}</UButton>
            <UButton :color="pending?.type === 'block' || pending?.type === 'delete' ? 'error' : 'primary'" :loading="busy" @click="executePending">
              {{ t('admin.users.confirmAction') }}
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
