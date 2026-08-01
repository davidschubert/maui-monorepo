<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { AdminUserListResponse, AdminUserRow } from '../../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'users.manage' })

const { t, te } = useI18n()
const { formatRelativeTime } = useFormatRelativeTime()
const { formatDate } = useFormatDate()
const localePath = useLocalePath()
const toast = useToast()
const confirm = useConfirm()
const auth = useAuthStore()
const { user: me } = useCurrentUser()

useHead({ title: () => t('admin.nav.people') })

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

// „Filter ohne Treffer" ist ein eigener Leerzustand (Audit-Befund C11): Suche
// ODER People-Filter aktiv → der nächste Schritt ist Zurücksetzen.
const hasActiveFilter = computed(() => filter.value !== null || activeSearch.value !== '')
function resetFilters() {
  search.value = ''
  activeSearch.value = ''
  const query = { ...route.query }
  delete query.filter
  void router.replace({ query })
  setPage(1)
}

/**
 * Rollen-Keys lesbar machen (Audit-Befund C12) — die Schwesterseite
 * (`users/[id].vue`) übersetzt sie längst, hier stand der rohe Key.
 *
 * Die Label-Spalte zeigt ALLE Appwrite-Labels eines Kontos, und das sind seit
 * A5 nicht nur Rollen: ein `label:<siteId>` ist ein LESE-Publikum
 * („ist Mitglied dieser Community"). Für solche Labels gibt es bewusst keine
 * Übersetzung — sie behalten ihren Wert, bekommen aber die neutrale,
 * monospacige Darstellung, die einem internen Schlüssel zusteht.
 */
function roleLabel(label: string): string {
  return te(`admin.roles.${label}`) ? t(`admin.roles.${label}`) : label
}
const isKnownRole = (label: string) => te(`admin.roles.${label}`)

// `value: string` (nicht der engere Role-Union): `createForm.roles` ist
// `string[]`, weil der Server die Liste prüft — sonst verlangt USelectMenu
// hier ein `Role[]` und der Typ der Route und der der Auswahl driften.
const roleItems = computed(() => ASSIGNABLE_ROLES.map(role => ({ label: roleLabel(role), value: role as string })))

const columns: TableColumn<AdminUserRow>[] = [
  { id: 'select', header: () => '' },
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

type UserAction = 'block' | 'unblock' | 'sessions' | 'delete'
const exportingId = ref<string | null>(null)

// ---- Bulk-Aktionen (Multi-Select): block/unblock + CSV-Export ----
const selected = ref(new Set<string>())
const isSelected = (id: string) => selected.value.has(id)
function toggleSelected(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
// Eigener Account bleibt abwählbar — Block auf sich selbst lehnt der Server ohnehin ab
const pageIds = computed(() => (data.value?.users ?? []).filter(u => u.$id !== me.value?.$id).map(u => u.$id))
const allSelected = computed(() => pageIds.value.length > 0 && pageIds.value.every(id => selected.value.has(id)))
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(pageIds.value)
}
watch(data, () => {
  const visible = new Set(pageIds.value)
  selected.value = new Set([...selected.value].filter(id => visible.has(id)))
})

async function runBulk(action: 'block' | 'unblock') {
  if (selected.value.size === 0) return
  try {
    let result: { ok: boolean, done: string[], failed: string[] } | null = null
    const ok = await confirm({
      title: t('admin.users.confirmTitle'),
      description: t(`admin.users.bulk.confirm.${action}`, { count: selected.value.size }),
      confirmLabel: t('admin.users.confirmAction'),
      color: action === 'block' ? 'error' : 'primary',
      action: async () => {
        result = await $fetch<{ ok: boolean, done: string[], failed: string[] }>('/api/admin/users/bulk', {
          method: 'POST',
          body: { action, ids: [...selected.value] },
        })
      },
    })
    if (!ok || !result) return
    const { done, failed } = result as { done: string[], failed: string[] }
    // Bei Teilerfolg nennt die Beschreibung den häufigsten Grund — sonst bleibt
    // „3 fehlgeschlagen" eine Zahl ohne nächsten Schritt.
    toast.add({
      title: failed.length
        ? t('admin.users.bulk.partial', { done: done.length, failed: failed.length })
        : t('admin.users.bulk.done', { count: done.length }),
      description: failed.length ? t('admin.users.bulk.partialDesc', { failed: failed.length }) : undefined,
      color: failed.length ? 'warning' : 'success',
    })
    selected.value = new Set()
    await refresh()
  }
  catch {
    toast.add({
      title: t('admin.users.actionFailed'),
      description: t('admin.users.bulk.failedDesc'),
      color: 'error',
    })
  }
}

// CSV-Download per Navigation — Content-Disposition macht daraus einen Download
function exportCsv() {
  window.location.href = '/api/admin/users/export-csv'
}

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
    // Der Download passiert außerhalb der Seite — ohne Meldung sieht der
    // Klick aus, als sei nichts geschehen (Audit-Befund C12, stummer Erfolg).
    toast.add({
      title: t('admin.users.exportDone'),
      description: t('admin.users.exportDoneDesc'),
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: t('admin.users.exportFailed'),
      description: t('admin.users.exportFailedDesc'),
      color: 'error',
    })
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
        ? { label: t('admin.users.block'), icon: 'i-ph-prohibit', color: 'error', disabled: isSelf, onSelect: () => { void runUserAction('block', user) } }
        : { label: t('admin.users.unblock'), icon: 'i-ph-lock-open', color: 'success', onSelect: () => { void runUserAction('unblock', user) } },
      { label: t('admin.users.clearSessions'), icon: 'i-ph-sign-out', onSelect: () => { void runUserAction('sessions', user) } },
      { label: t('admin.users.detail.manageRoles'), icon: 'i-ph-shield-star', onSelect: () => navigateTo(localePath(`/dashboard/users/${user.$id}`)) },
      { label: t('admin.users.export'), icon: 'i-ph-download-simple', onSelect: () => exportUser(user) },
    ],
    [
      { label: t('admin.users.deleteUser'), icon: 'i-ph-trash', color: 'error', disabled: isSelf, onSelect: () => { void runUserAction('delete', user) } },
    ],
  ]
}

async function runUserAction(type: UserAction, user: AdminUserRow) {
  try {
    // `selfLogout`: das Leeren der eigenen Sitzungen wirft einen selbst raus —
    // dann kein Toast, sondern Abmeldung.
    let selfLogout = false
    const ok = await confirm({
      title: t('admin.users.confirmTitle'),
      description: t(`admin.users.confirm.${type}`, { name: user.name }),
      confirmLabel: t('admin.users.confirmAction'),
      color: type === 'block' || type === 'delete' ? 'error' : 'primary',
      action: async () => {
        if (type === 'sessions') {
          const result = await $fetch<{ ok: boolean, self: boolean }>(`/api/admin/users/${user.$id}/sessions`, { method: 'DELETE' })
          selfLogout = result.self
        }
        else if (type === 'delete') {
          // `as string`: Template-Literal matcht auch /api/admin/users/stats (GET-only)
          await $fetch(`/api/admin/users/${user.$id}` as string, { method: 'DELETE' })
        }
        else {
          await $fetch(`/api/admin/users/${user.$id}/status`, { method: 'PATCH', body: { blocked: type === 'block' } })
        }
      },
    })
    if (!ok) return
    if (type === 'sessions') {
      toast.add({
        title: t('admin.users.sessionsCleared'),
        description: t('admin.users.sessionsClearedDesc'),
        color: 'success',
      })
      if (selfLogout) {
        auth.setUser(null)
        await navigateTo(localePath('/'))
        return
      }
    }
    else if (type === 'delete') {
      // Wo die Daten der gelöschten Person geblieben sind, weiß sonst niemand.
      toast.add({
        title: t('admin.users.deleted'),
        description: t('admin.users.deletedDesc'),
        color: 'success',
      })
    }
    else {
      toast.add({ title: t(type === 'block' ? 'admin.users.blocked' : 'admin.users.unblocked'), color: 'success' })
    }
    await refresh()
  }
  catch (error) {
    // `data.reason` (Fehler-Envelope): `data.data.code` kam nie an — s. [id].vue.
    const lastAdmin = (error as { data?: { reason?: string } })?.data?.reason === 'last_admin'
    toast.add({
      title: lastAdmin ? t('admin.users.lastAdmin') : t('admin.users.actionFailed'),
      description: lastAdmin ? t('admin.users.lastAdminDesc') : t('admin.users.actionFailedDesc'),
      color: 'error',
    })
  }
}

// ---- „Add users": User anlegen (Name, E-Mail, Passwort, optionale Rollen) ----

const createOpen = ref(false)
const createBusy = ref(false)
const createForm = reactive({ name: '', email: '', password: '', roles: [] as string[] })

// Rollen-Auswahl aus ASSIGNABLE_ROLES (Core-UI-Quelle); den Eskalations-Schutz
// erzwingt der Server (Muster role.patch). Die Liste selbst ist seit C12 ein
// USelectMenu multiple statt eines handgebauten Knopf-Paars — dieselbe
// Bedienung wie überall sonst, mit Übersetzung statt Key.
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
    // Das Start-Passwort steht nur in DIESEM Formular — der Hinweis, es
    // weiterzugeben, gehört genau hierhin, bevor das Modal schließt.
    toast.add({
      title: t('admin.users.add.done'),
      description: t('admin.users.add.doneDesc'),
      color: 'success',
    })
    createOpen.value = false
    await refresh()
  }
  catch (error) {
    const duplicate = (error as { statusCode?: number }).statusCode === 409
    toast.add({
      title: duplicate ? t('admin.users.add.duplicate') : t('admin.users.add.failed'),
      description: duplicate ? t('admin.users.add.duplicateDesc') : t('admin.users.add.failedDesc'),
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
          <UButton icon="i-ph-file-csv" size="sm" color="neutral" variant="subtle" data-testid="export-csv" @click="exportCsv">
            {{ t('admin.users.exportCsv') }}
          </UButton>
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
      <div v-if="selected.size > 0" class="mb-3 flex flex-wrap items-center gap-2" data-users-bulkbar>
        <UBadge color="neutral" variant="subtle">{{ t('admin.users.bulk.count', { count: selected.size }) }}</UBadge>
        <UButton size="xs" color="error" variant="soft" icon="i-ph-prohibit" data-bulk-block @click="runBulk('block')">
          {{ t('admin.users.block') }}
        </UButton>
        <UButton size="xs" color="success" variant="soft" icon="i-ph-lock-open" data-bulk-unblock @click="runBulk('unblock')">
          {{ t('admin.users.unblock') }}
        </UButton>
      </div>

      <UTable :data="data?.users ?? []" :columns="columns" data-users-table>
        <template #select-header>
          <UCheckbox
            :model-value="allSelected"
            :aria-label="t('admin.users.bulk.selectAll')"
            data-users-select-all
            @update:model-value="toggleAll"
          />
        </template>
        <template #select-cell="{ row }">
          <UCheckbox
            v-if="row.original.$id !== me?.$id"
            :model-value="isSelected(row.original.$id)"
            :aria-label="t('admin.users.bulk.selectOne')"
            :data-users-select="row.original.$id"
            @update:model-value="toggleSelected(row.original.$id)"
          />
        </template>
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
            <!-- UChip statt handgebautem Punkt (Audit-Befund C12) — genau wie
                 auf der Detailseite users/[id].vue -->
            <UChip
              :show="isOnline(row.original)"
              color="success"
              position="bottom-right"
              inset
              size="sm"
              class="shrink-0"
              :title="isOnline(row.original) ? t('admin.users.online') : undefined"
            >
              <UserAvatar :user="{ name: row.original.name, email: row.original.email, prefs: { avatarUrl: row.original.avatarUrl } }" size="xs" />
            </UChip>
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
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="label in row.original.labels"
              :key="label"
              :color="isKnownRole(label) ? 'primary' : 'neutral'"
              variant="subtle"
              :class="isKnownRole(label) ? undefined : 'font-mono text-xs'"
              :title="isKnownRole(label) ? undefined : label"
            >
              {{ roleLabel(label) }}
            </UBadge>
            <span v-if="!row.original.labels.length" class="text-muted">—</span>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
              <UButton
                icon="i-ph-dots-three-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="t('admin.users.rowActions')"
                :loading="exportingId === row.original.$id"
              />
            </UDropdownMenu>
          </div>
        </template>
        <!--
          Leerzustand als MUSTER (Audit-Befund C11): „Filter/Suche ohne Treffer"
          ist ein ANDERER Zustand als „noch nichts angelegt" — hier ist der eine
          nächste Schritt das Zurücksetzen, nicht das Anlegen. Ohne Filter zeigen
          wir nur die Erklärung (eine Nutzerliste ist nie wirklich leer: man
          selbst steht drin).
        -->
        <template #empty>
          <CoreEmptyState
            v-if="hasActiveFilter"
            icon="i-ph-funnel"
            :title="t('ui.empty.noResultsTitle')"
            :description="t('ui.empty.noResultsText')"
            :action-label="t('ui.empty.resetFilters')"
            action-icon="i-ph-arrow-counter-clockwise"
            @action="resetFilters"
          />
          <CoreEmptyState
            v-else
            icon="i-ph-users"
            :title="t('admin.users.emptyTitle')"
            :description="t('admin.users.emptyText')"
            :action-label="t('admin.users.add.cta')"
            action-icon="i-ph-plus"
            @action="openCreate"
          />
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
            <UFormField :label="t('admin.users.add.roles')" :help="t('admin.users.add.rolesHelp')">
              <USelectMenu
                v-model="createForm.roles"
                multiple
                value-key="value"
                :items="roleItems"
                :placeholder="t('admin.users.add.rolesPlaceholder')"
                :search-input="false"
                class="w-full"
                data-testid="add-users-roles"
              />
            </UFormField>

            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="ghost" @click="() => { createOpen = false }">{{ t('ui.cancel') }}</UButton>
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
