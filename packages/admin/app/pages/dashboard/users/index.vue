<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
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

const { data, refresh } = await useFetch<AdminUserListResponse>('/api/admin/users', {
  query: computed(() => ({ search: activeSearch.value, page: page.value })),
})

function runSearch() {
  activeSearch.value = search.value.trim()
  setPage(1)
}

const columns: TableColumn<AdminUserRow>[] = [
  { accessorKey: 'name', header: () => t('admin.users.name') },
  { accessorKey: 'email', header: () => t('admin.users.email') },
  { accessorKey: '$createdAt', header: () => t('admin.users.joined'), id: 'createdAt' },
  { accessorKey: 'accessedAt', header: () => t('admin.users.lastActivity'), id: 'lastActivity' },
  { accessorKey: 'emailVerification', header: () => t('admin.users.verified'), id: 'verified' },
  { accessorKey: 'status', header: () => t('admin.users.status'), id: 'status' },
  { accessorKey: 'labels', header: () => t('admin.users.labels'), id: 'labels' },
  { id: 'actions', header: () => t('admin.users.actions') },
]

/** Bestätigungs-Dialog-State für alle Aktionen */
const pending = ref<{ type: 'block' | 'unblock' | 'sessions', user: AdminUserRow } | null>(null)
const busy = ref(false)

const confirmText = computed(() => {
  if (!pending.value) return ''
  return t(`admin.users.confirm.${pending.value.type}`, { name: pending.value.user.name })
})

async function executePending() {
  if (!pending.value) return
  busy.value = true
  const { type, user } = pending.value

  try {
    if (type === 'sessions') {
      const result = await $fetch<{ ok: boolean, self: boolean }>(`/api/admin/users/${user.$id}/sessions`, { method: 'DELETE' })
      toast.add({ title: t('admin.users.sessionsCleared'), color: 'success' })
      if (result.self) {
        // Eigene Sessions beendet → ausloggen und zur Startseite
        pending.value = null
        auth.setUser(null)
        await navigateTo(localePath('/'))
        return
      }
    }
    else {
      await $fetch(`/api/admin/users/${user.$id}/status`, {
        method: 'PATCH',
        body: { blocked: type === 'block' },
      })
      toast.add({ title: t(type === 'block' ? 'admin.users.blocked' : 'admin.users.unblocked'), color: 'success' })
      await refresh()
    }
    pending.value = null
  }
  catch {
    toast.add({ title: t('admin.users.actionFailed'), color: 'error' })
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
        <template #right>
          <form class="flex gap-2" @submit.prevent="runSearch">
            <UInput v-model="search" icon="i-ph-magnifying-glass" :placeholder="t('admin.users.searchPlaceholder')" />
            <UButton type="submit" color="neutral" variant="subtle">{{ t('admin.users.search') }}</UButton>
          </form>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable :data="data?.users ?? []" :columns="columns" data-users-table>
      <template #name-cell="{ row }">
        <ULink :to="localePath(`/dashboard/users/${row.original.$id}`)" class="font-medium text-primary hover:underline">
          {{ row.original.name }}
        </ULink>
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
        <UIcon :name="row.original.emailVerification ? 'i-ph-check-circle' : 'i-ph-minus'" :class="row.original.emailVerification ? 'text-success' : 'text-muted'" />
      </template>
      <template #status-cell="{ row }">
        <UBadge :color="row.original.status ? 'success' : 'error'" variant="subtle">
          {{ row.original.status ? t('admin.users.active') : t('admin.users.blockedBadge') }}
        </UBadge>
      </template>
      <template #labels-cell="{ row }">
        <div class="flex gap-1">
          <UBadge v-for="label in row.original.labels" :key="label" color="neutral" variant="subtle">{{ label }}</UBadge>
        </div>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex gap-1">
          <UButton
            v-if="row.original.status"
            size="xs" color="error" variant="ghost" icon="i-ph-prohibit"
            :disabled="row.original.$id === me?.$id"
            @click="pending = { type: 'block', user: row.original }"
          >
            {{ t('admin.users.block') }}
          </UButton>
          <UButton
            v-else
            size="xs" color="success" variant="ghost" icon="i-ph-lock-open"
            @click="pending = { type: 'unblock', user: row.original }"
          >
            {{ t('admin.users.unblock') }}
          </UButton>
          <UButton
            size="xs" color="neutral" variant="ghost" icon="i-ph-sign-out"
            @click="pending = { type: 'sessions', user: row.original }"
          >
            {{ t('admin.users.clearSessions') }}
          </UButton>
        </div>
      </template>
    </UTable>

    <UPagination
      v-if="(data?.total ?? 0) > 25"
      :page="page"
      :total="data?.total ?? 0"
      :items-per-page="25"
      @update:page="setPage"
    />

    <UModal :open="pending !== null" :title="t('admin.users.confirmTitle')" @update:open="(value: boolean) => { if (!value) pending = null }">
      <template #body>
        <p class="text-sm">{{ confirmText }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="pending = null">{{ t('comments.item.cancel') }}</UButton>
          <UButton :color="pending?.type === 'block' ? 'error' : 'primary'" :loading="busy" @click="executePending">
            {{ t('admin.users.confirmAction') }}
          </UButton>
        </div>
      </template>
    </UModal>
    </template>
  </UDashboardPanel>
</template>
