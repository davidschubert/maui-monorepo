<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { StorageBucketOverview, StorageFileEntry, StorageOverview } from '../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'storage.manage' })

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const config = useRuntimeConfig()
const { formatRelativeTime } = useFormatRelativeTime()

const { data, status, refresh } = useFetch<StorageOverview>('/api/admin/storage', {
  lazy: true,
  server: false,
})

const confirm = useConfirm()

// Bucket-Wechsler über alle Buckets der Instanz (buckets.read)
const selectedBucket = ref('')
const bucketItems = computed(() => data.value?.buckets.map(b => b.id) ?? [])
watchEffect(() => {
  if (!selectedBucket.value && bucketItems.value.length > 0) selectedBucket.value = bucketItems.value[0]!
})
const current = computed<StorageBucketOverview | null>(
  () => data.value?.buckets.find(b => b.id === selectedBucket.value) ?? null,
)

/**
 * SEITENWEISE statt alles auf einmal (Audit-Befund): diese Seite hat die
 * komplette Dateiliste eines Buckets gerendert — bei einem Avatars-Bucket mit
 * ein paar tausend Dateien sind das ein paar tausend DOM-Knoten.
 *
 * Die Paginierung läuft im BROWSER, nicht auf dem Server, und das ist Absicht:
 * die Route MUSS ohnehin alle Dateien einsammeln, weil Gesamtgröße und
 * Verwaisten-Zahl sonst nur ein Ausschnitt wären. Ein zweiter, seitenweiser
 * Abruf würde dieselben Daten ein zweites Mal holen.
 */
const PAGE_SIZE = 25
const { page, setPage } = usePagination({ pageSize: PAGE_SIZE })
const search = ref('')
const { sortField, sortDir, toggle } = useTableSort('$createdAt', 'desc')

watch([selectedBucket, search, sortField, sortDir], () => setPage(1))

const filteredFiles = computed(() => {
  const needle = search.value.trim().toLowerCase()
  const list = (current.value?.files ?? []).filter(f => !needle || f.name.toLowerCase().includes(needle))
  const factor = sortDir.value === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    if (sortField.value === 'name') return factor * a.name.localeCompare(b.name)
    if (sortField.value === 'sizeBytes') return factor * (a.sizeBytes - b.sizeBytes)
    return factor * (Date.parse(a.$createdAt) - Date.parse(b.$createdAt))
  })
})
const pagedFiles = computed(() => filteredFiles.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

const hasActiveFilter = computed(() => search.value.trim() !== '')
function resetFilters() {
  search.value = ''
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Bild-Preview gibt es nur für den Avatars-Bucket (Core-Proxy ist bewusst
// darauf begrenzt) — andere Buckets bekommen ein Datei-Icon nach Typ.
const avatarsBucket = computed(() => config.public.appwriteAvatarsBucket)
function previewUrl(file: StorageFileEntry): string | null {
  if (current.value?.id !== avatarsBucket.value) return null
  if (!file.mimeType.startsWith('image/')) return null
  return `/api/storage/${current.value.id}/${file.$id}?w=80&h=80&q=80`
}
function fileIcon(file: StorageFileEntry): string {
  if (file.mimeType.startsWith('image/')) return 'i-ph-image'
  if (file.mimeType.includes('font') || file.name.endsWith('.woff2')) return 'i-ph-text-aa'
  if (file.mimeType.includes('json')) return 'i-ph-brackets-curly'
  if (file.mimeType.includes('zip') || file.mimeType.includes('tar')) return 'i-ph-file-archive'
  return 'i-ph-file'
}

async function deleteFile(id: string) {
  await $fetch(`/api/admin/storage/${selectedBucket.value}/${id}`, { method: 'DELETE' })
}

/**
 * EIN Weg für beide Löschungen (useConfirm, Audit-Befund C10). Die
 * kontextabhängige Warnung „hängt noch an einem Benutzer" bleibt erhalten —
 * sie geht als `warning` in denselben Dialog.
 */
async function confirmDelete(options: {
  description: string
  warning?: { title: string, description?: string }
  action: () => Promise<void>
}) {
  try {
    const ok = await confirm({
      title: t('admin.storage.confirmTitle'),
      description: options.description,
      confirmLabel: t('admin.users.confirmAction'),
      warning: options.warning,
      action: options.action,
    })
    if (!ok) return
    toast.add({ title: t('admin.storage.deleted'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('admin.users.actionFailed'), color: 'error' })
  }
}

/** Einzelne Datei löschen */
function removeFile(file: StorageFileEntry) {
  const linked = current.value?.orphanAware && !file.orphan
  return confirmDelete({
    description: t('admin.storage.confirmOne'),
    warning: linked
      ? {
          title: t('admin.storage.linkedWarningTitle'),
          description: t('admin.storage.linkedWarningText', { name: file.linkedUserName }),
        }
      : undefined,
    action: () => deleteFile(file.$id),
  })
}

const HIDE_SM = { td: 'hidden sm:table-cell', th: 'hidden sm:table-cell' }
const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }

const columns = computed<TableColumn<StorageFileEntry>[]>(() => [
  { id: 'preview', header: () => t('admin.storage.col.preview') },
  { accessorKey: 'name', header: () => t('admin.storage.col.name') },
  { accessorKey: 'sizeBytes', header: () => t('admin.storage.col.size'), meta: { class: HIDE_SM } },
  { accessorKey: '$createdAt', header: () => t('admin.storage.col.uploaded'), id: 'uploaded', meta: { class: HIDE_MD } },
  { id: 'state', header: () => t('admin.storage.col.state') },
  { id: 'actions', header: () => '' },
])

/** Alle verwaisten Dateien des Buckets löschen */
function removeOrphans() {
  const orphans = current.value?.files.filter(f => f.orphan) ?? []
  return confirmDelete({
    description: t('admin.storage.confirmOrphans', { count: orphans.length }),
    action: async () => {
      for (const f of orphans) await deleteFile(f.$id)
    },
  })
}
</script>

<template>
  <UDashboardPanel id="storage">
    <template #header>
      <UDashboardNavbar :title="t('admin.storage.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="current?.orphanAware && current.orphanCount > 0"
            color="error" variant="subtle" icon="i-ph-broom"
            @click="removeOrphans"
          >
            {{ t('admin.storage.deleteOrphans', { count: current.orphanCount }) }}
          </UButton>
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

        <UAlert
          v-else-if="!data?.available"
          color="warning"
          variant="subtle"
          icon="i-ph-warning"
          :title="t('admin.storage.unavailableTitle')"
          :description="t('admin.storage.unavailableText')"
        />

        <div v-else-if="current" class="space-y-4">
          <div class="flex flex-wrap items-center gap-4 text-sm text-muted">
            <div class="flex items-center gap-2">
              <span>{{ t('admin.storage.bucket') }}:</span>
              <USelectMenu v-model="selectedBucket" :items="bucketItems" :search-input="false" size="sm" class="min-w-40 font-mono" data-testid="bucket-select" />
            </div>
            <span>{{ t('admin.storage.files') }}: <span class="font-bold text-default">{{ current.files.length }}</span></span>
            <span>{{ t('admin.storage.size') }}: <span class="font-bold text-default">{{ formatBytes(current.totalBytes) }}</span></span>
            <span v-if="current.orphanAware">{{ t('admin.storage.orphans') }}: <span class="font-bold text-default">{{ current.orphanCount }}</span></span>
          </div>

          <UAlert
            v-if="current.readOnly"
            color="info"
            variant="subtle"
            icon="i-ph-lock"
            :title="t('admin.storage.readOnlyTitle')"
            :description="t('admin.storage.readOnlyText')"
          >
            <template #actions>
              <UButton color="info" variant="link" size="xs" :to="localePath('/dashboard/admin/gdpr-exports')">
                {{ t('admin.storage.readOnlyLink') }}
              </UButton>
            </template>
          </UAlert>

          <UInput
            v-model="search"
            icon="i-ph-magnifying-glass"
            :placeholder="t('admin.storage.searchPlaceholder')"
            class="max-w-md"
            data-storage-search
          />

          <UTable :data="pagedFiles" :columns="columns" data-storage-table>
            <template #name-header>
              <SortableHeader :label="t('admin.storage.col.name')" field="name" :active="sortField" :dir="sortDir" @toggle="toggle" />
            </template>
            <template #sizeBytes-header>
              <SortableHeader :label="t('admin.storage.col.size')" field="sizeBytes" :active="sortField" :dir="sortDir" @toggle="toggle" />
            </template>
            <template #uploaded-header>
              <SortableHeader :label="t('admin.storage.col.uploaded')" field="$createdAt" :active="sortField" :dir="sortDir" @toggle="toggle" />
            </template>

            <template #preview-cell="{ row }">
              <img v-if="previewUrl(row.original)" :src="previewUrl(row.original)!" :alt="row.original.name" class="size-10 shrink-0 rounded-md object-cover ring ring-default" loading="lazy">
              <div v-else class="flex size-10 shrink-0 items-center justify-center rounded-md bg-elevated ring ring-default">
                <UIcon :name="fileIcon(row.original)" class="size-5 text-muted" />
              </div>
            </template>
            <template #name-cell="{ row }">
              <span class="block max-w-xs truncate font-medium" :title="row.original.name">{{ row.original.name }}</span>
            </template>
            <template #sizeBytes-cell="{ row }">
              <span class="whitespace-nowrap tabular-nums text-muted">{{ formatBytes(row.original.sizeBytes) }}</span>
            </template>
            <template #uploaded-cell="{ row }">
              <span class="whitespace-nowrap text-muted">{{ formatRelativeTime(row.original.$createdAt) }}</span>
            </template>
            <template #state-cell="{ row }">
              <UBadge v-if="row.original.orphan" color="warning" variant="subtle" size="sm">{{ t('admin.storage.orphan') }}</UBadge>
              <span v-else class="text-muted">—</span>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end">
                <UButton
                  v-if="!current!.readOnly"
                  color="error"
                  variant="ghost"
                  size="xs"
                  icon="i-ph-trash"
                  :aria-label="t('admin.storage.deleteFile')"
                  @click="removeFile(row.original)"
                />
              </div>
            </template>

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
                icon="i-ph-folder-open"
                :title="t('admin.storage.emptyTitle')"
                :description="t('admin.storage.empty')"
              />
            </template>
          </UTable>

          <UPagination
            v-if="filteredFiles.length > PAGE_SIZE"
            :page="page"
            :total="filteredFiles.length"
            :items-per-page="PAGE_SIZE"
            @update:page="setPage"
          />
        </div>
      </ClientOnly>

    </template>
  </UDashboardPanel>
</template>
