<script setup lang="ts">
// GDPR-Pre-Delete-Snapshots: Liste + Download + manuelles Löschen. Die Dateien
// entstehen bei jeder Account-Löschung (Self + Admin) und verfallen nach 30
// Tagen automatisch (Lazy-Cleanup beim Listen/Snapshotten).
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'users.manage' })

interface GdprExportFile {
  $id: string
  name: string
  sizeOriginal: number
  $createdAt: string
}

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const { formatDate } = useFormatDate()

useHead({ title: () => t('admin.gdprExports.title') })

const { data, refresh } = await useFetch<{ total: number, files: GdprExportFile[] }>('/api/admin/gdpr-exports')

// Doppelklick-Schutz für den Download (der Löschweg sperrt im Dialog selbst)
const downloading = ref('')

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function download(file: GdprExportFile) {
  if (downloading.value) return
  downloading.value = file.$id
  try {
    const blob = await $fetch<Blob>(`/api/admin/gdpr-exports/${file.$id}`, { responseType: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    URL.revokeObjectURL(url)
    // Stummer Erfolg (Audit-Befund C12): auf der Seite selbst ändert sich
    // nichts, der Snapshot landet unsichtbar im Download-Ordner.
    toast.add({
      title: t('admin.gdprExports.downloadDone'),
      description: t('admin.gdprExports.downloadDoneDesc'),
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: t('admin.gdprExports.downloadError'),
      description: t('admin.gdprExports.downloadErrorDesc'),
      color: 'error',
    })
  }
  finally {
    downloading.value = ''
  }
}

async function remove(file: GdprExportFile) {
  try {
    const ok = await confirm({
      title: t('admin.gdprExports.confirmTitle'),
      description: t('admin.gdprExports.confirmText', { name: file.name }),
      confirmLabel: t('admin.gdprExports.delete'),
      action: () => $fetch(`/api/admin/gdpr-exports/${file.$id}`, { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({ title: t('admin.gdprExports.deleted'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({
      title: t('admin.gdprExports.deleteError'),
      description: t('admin.gdprExports.deleteErrorDesc'),
      color: 'error',
    })
  }
}

const HIDE_SM = { td: 'hidden sm:table-cell', th: 'hidden sm:table-cell' }

const columns = computed<TableColumn<GdprExportFile>[]>(() => [
  { accessorKey: 'name', header: () => t('admin.gdprExports.col.file') },
  { accessorKey: 'sizeOriginal', header: () => t('admin.gdprExports.col.size'), id: 'size', meta: { class: HIDE_SM } },
  { accessorKey: '$createdAt', header: () => t('admin.gdprExports.col.created'), id: 'created' },
  { id: 'actions', header: () => '' },
])
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-muted">{{ t('admin.gdprExports.hint') }}</p>

    <UTable :data="data?.files ?? []" :columns="columns" data-gdpr-exports-table>
      <template #name-cell="{ row }">
        <span class="block max-w-xs truncate font-mono text-sm" :title="row.original.name">{{ row.original.name }}</span>
      </template>
      <template #size-cell="{ row }">
        <span class="whitespace-nowrap tabular-nums text-muted">{{ formatSize(row.original.sizeOriginal) }}</span>
      </template>
      <template #created-cell="{ row }">
        <span class="whitespace-nowrap text-muted">{{ formatDate(row.original.$createdAt) }}</span>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <UButton
            size="xs" color="neutral" variant="subtle" icon="i-ph-download-simple"
            :loading="downloading === row.original.$id" :disabled="!!downloading"
            @click="download(row.original)"
          >
            {{ t('admin.gdprExports.download') }}
          </UButton>
          <UButton
            size="xs" color="error" variant="subtle" icon="i-ph-trash"
            :aria-label="t('admin.gdprExports.delete')"
            @click="remove(row.original)"
          />
        </div>
      </template>

      <template #empty>
        <CoreEmptyState
          icon="i-ph-file-lock"
          :title="t('admin.gdprExports.emptyTitle')"
          :description="t('admin.gdprExports.empty')"
        />
      </template>
    </UTable>
  </div>
</template>
