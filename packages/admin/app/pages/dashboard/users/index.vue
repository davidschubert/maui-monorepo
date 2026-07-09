<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { AdminUserListResponse, AdminUserRow } from '../../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'users.manage' })

const { t } = useI18n()
const { formatRelativeTime } = useFormatRelativeTime()
const { formatDate } = useFormatDate()
const localePath = useLocalePath()
const toast = useToast()
const auth = useAuthStore()
const { user: me } = useCurrentUser()

const search = ref('')
const activeSearch = ref('')
const { page, setPage } = usePagination()
const { sortField, sortDir, toggle } = useTableSort('$createdAt', 'desc')

// People-Filter (?filter=active|new|online) — Route ist die Wahrheit, damit
// Sidebar-Unterpunkte UND Toolbar-Tabs per Link steuern können
const route = useRoute()
const router = useRouter()
type PeopleFilter = 'all' | 'active' | 'new' | 'online'
const PEOPLE_FILTERS: PeopleFilter[] = ['all', 'active', 'new', 'online']
const FILTER_ICON: Record<PeopleFilter, string> = {
  all: 'i-ph-list-bullets',
  active: 'i-ph-pulse',
  new: 'i-ph-sparkle',
  online: 'i-ph-broadcast',
}
const filter = computed<Exclude<PeopleFilter, 'all'> | null>(() => {
  const value = route.query.filter
  return value === 'active' || value === 'new' || value === 'online' ? value : null
})
watch(filter, () => setPage(1))

const filterLinks = computed(() => PEOPLE_FILTERS.map(value => ({
  label: t(`admin.users.filter.${value}`),
  icon: FILTER_ICON[value],
  active: (filter.value ?? 'all') === value,
  onSelect: () => {
    const query = { ...route.query }
    if (value === 'all') delete query.filter
    else query.filter = value
    void router.replace({ query })
  },
})))

const { data, refresh } = await useFetch<AdminUserListResponse>('/api/admin/users', {
  query: computed(() => ({
    search: activeSearch.value,
    page: page.value,
    sort: sortField.value,
    dir: sortDir.value,
    ...(filter.value ? { filter: filter.value } : {}),
  })),
})

// Sortierwechsel → zurück auf Seite 1
watch([sortField, sortDir], () => setPage(1))

// Live-Online: überlagert den einmaligen Server-Snapshot (row.online) mit der
// aktuellen Presence (Channel.presences(), inkl. eigener). So sieht man sich
// selbst + gerade Aktive sofort online, ohne die Liste neu zu laden.
const { present } = usePresence()
const onlineIds = computed(() => new Set(present.value.map(u => u.userId)))
const isOnline = (row: AdminUserRow) => onlineIds.value.has(row.$id) || row.online

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

const pending = ref<{ type: 'block' | 'unblock' | 'sessions' | 'delete', user: AdminUserRow } | null>(null)
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
  // Rollen-Verwaltung liegt auf der Detailseite (Mehrfachrollen-Editor) —
  // hier nur die schnellen Account-Aktionen.
  return [
    [
      user.status
        ? { label: t('admin.users.block'), icon: 'i-ph-prohibit', color: 'error', disabled: isSelf, onSelect: () => { pending.value = { type: 'block', user } } }
        : { label: t('admin.users.unblock'), icon: 'i-ph-lock-open', color: 'success', onSelect: () => { pending.value = { type: 'unblock', user } } },
      { label: t('admin.users.clearSessions'), icon: 'i-ph-sign-out', onSelect: () => { pending.value = { type: 'sessions', user } } },
      { label: t('admin.users.detail.manageRoles'), icon: 'i-ph-shield-star', onSelect: () => navigateTo(localePath(`/dashboard/users/${user.$id}`)) },
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
    else if (type === 'delete') {
      // `as string`: Template-Literal matcht auch /api/admin/users/stats (GET-only)
      await $fetch(`/api/admin/users/${user.$id}` as string, { method: 'DELETE' })
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

// ---- „Add users": User anlegen (Name, E-Mail, Passwort, optionale Rollen) ----

const createOpen = ref(false)
const createBusy = ref(false)
const createForm = reactive({ name: '', email: '', password: '', roles: [] as string[] })

// Rollen-Auswahl wie auf der Detailseite (ASSIGNABLE_ROLES, Core-UI-Quelle);
// den Eskalations-Schutz erzwingt der Server (Muster role.patch)
const assignableRoles = ASSIGNABLE_ROLES

function openCreate() {
  Object.assign(createForm, { name: '', email: '', password: '', roles: [] })
  createOpen.value = true
}

async function createUser() {
  createBusy.value = true
  try {
    await $fetch('/api/admin/users', {
      method: 'POST',
      body: { ...createForm, name: createForm.name.trim(), email: createForm.email.trim() },
    })
    toast.add({ title: t('admin.users.add.done'), color: 'success' })
    createOpen.value = false
    await refresh()
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    toast.add({
      title: statusCode === 409 ? t('admin.users.add.duplicate') : t('admin.users.add.failed'),
      color: 'error',
    })
  }
  finally {
    createBusy.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <UDashboardNavbar :title="`${t(`admin.users.filter.${filter ?? 'all'}`)} (${data?.total ?? 0})`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" size="sm" data-testid="add-users" @click="openCreate">
            {{ t('admin.users.add.cta') }}
          </UButton>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="filterLinks" highlight class="-mx-1 flex-1" data-people-filter />
      </UDashboardToolbar>
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
            <span class="relative inline-flex shrink-0">
              <UserAvatar :user="{ name: row.original.name, email: row.original.email, prefs: { avatarUrl: row.original.avatarUrl } }" size="xs" />
              <span
                v-if="isOnline(row.original)"
                class="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success ring-2 ring-default"
                :title="t('admin.users.online')"
              />
            </span>
            <span class="hover:underline">{{ row.original.name }}</span>
          </ULink>
        </template>
        <template #active-cell="{ row }">
          <span
            class="inline-flex items-center gap-1.5 text-sm"
            :title="!isOnline(row.original) && row.original.lastSeen ? formatDate(row.original.lastSeen) : undefined"
          >
            <span class="size-2 rounded-full" :class="isOnline(row.original) ? 'bg-success' : 'bg-error'" />
            {{ isOnline(row.original) ? t('admin.users.online') : t('admin.users.offline') }}
          </span>
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
            <UButton color="neutral" variant="ghost" @click="pending = null">{{ t('ui.cancel') }}</UButton>
            <UButton :color="pending?.type === 'block' || pending?.type === 'delete' ? 'error' : 'primary'" :loading="busy" @click="executePending">
              {{ t('admin.users.confirmAction') }}
            </UButton>
          </div>
        </template>
      </UModal>

      <UModal v-model:open="createOpen" :title="t('admin.users.add.title')">
        <template #body>
          <form class="space-y-4" data-testid="add-users-form" @submit.prevent="createUser">
            <UFormField :label="t('admin.users.name')" required>
              <UInput v-model="createForm.name" class="w-full" :maxlength="128" data-testid="add-users-name" />
            </UFormField>
            <UFormField :label="t('admin.users.email')" required>
              <UInput v-model="createForm.email" type="email" class="w-full" data-testid="add-users-email" />
            </UFormField>
            <UFormField :label="t('admin.users.add.password')" :help="t('admin.users.add.passwordHelp')" required>
              <UInput v-model="createForm.password" type="text" class="w-full" :minlength="8" data-testid="add-users-password" />
            </UFormField>
            <UFormField :label="t('admin.users.add.roles')">
              <div class="flex flex-wrap gap-1">
                <UButton
                  v-for="role in assignableRoles"
                  :key="role"
                  size="sm"
                  :color="createForm.roles.includes(role) ? 'primary' : 'neutral'"
                  :variant="createForm.roles.includes(role) ? 'soft' : 'ghost'"
                  @click="createForm.roles = createForm.roles.includes(role)
                    ? createForm.roles.filter(r => r !== role)
                    : [...createForm.roles, role]"
                >
                  {{ role }}
                </UButton>
              </div>
            </UFormField>

            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="ghost" @click="createOpen = false">{{ t('ui.cancel') }}</UButton>
              <UButton
                type="submit"
                :loading="createBusy"
                :disabled="!createForm.name.trim() || !createForm.email.trim() || createForm.password.length < 8"
                data-testid="add-users-save"
              >
                {{ t('admin.users.add.save') }}
              </UButton>
            </div>
          </form>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
