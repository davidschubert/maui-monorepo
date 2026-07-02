<script setup lang="ts">
// GDPR-Pre-Delete-Snapshots: Liste + Download + manuelles Löschen. Die Dateien
// entstehen bei jeder Account-Löschung (Self + Admin) und verfallen nach 30
// Tagen automatisch (Lazy-Cleanup beim Listen/Snapshotten).
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'users.manage' })

interface GdprExportFile {
  $id: string
  name: string
  sizeOriginal: number
  $createdAt: string
}

const { t } = useI18n()
const toast = useToast()
const { formatDate } = useFormatDate()

const { data, refresh } = await useFetch<{ total: number, files: GdprExportFile[] }>('/api/admin/gdpr-exports')

const busy = ref(false)
const pendingDelete = ref<GdprExportFile | null>(null)

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function download(file: GdprExportFile) {
  try {
    const blob = await $fetch<Blob>(`/api/admin/gdpr-exports/${file.$id}`, { responseType: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    URL.revokeObjectURL(url)
  }
  catch {
    toast.add({ title: t('admin.gdprExports.downloadError'), color: 'error' })
  }
}

async function executeDelete() {
  if (!pendingDelete.value) return
  busy.value = true
  try {
    await $fetch(`/api/admin/gdpr-exports/${pendingDelete.value.$id}`, { method: 'DELETE' })
    toast.add({ title: t('admin.gdprExports.deleted'), color: 'success' })
    pendingDelete.value = null
    await refresh()
  }
  catch {
    toast.add({ title: t('admin.gdprExports.deleteError'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-muted">{{ t('admin.gdprExports.hint') }}</p>

    <p v-if="!data?.files.length" class="py-12 text-center text-sm text-muted">
      {{ t('admin.gdprExports.empty') }}
    </p>

    <ul v-else class="divide-y divide-default rounded-lg border border-default">
      <li v-for="file in data.files" :key="file.$id" class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div class="min-w-0">
          <p class="truncate font-mono text-sm">{{ file.name }}</p>
          <p class="text-xs text-muted">{{ formatDate(file.$createdAt) }} · {{ formatSize(file.sizeOriginal) }}</p>
        </div>
        <div class="flex items-center gap-2">
          <UButton size="xs" color="neutral" variant="subtle" icon="i-ph-download-simple" @click="download(file)">
            {{ t('admin.gdprExports.download') }}
          </UButton>
          <UButton size="xs" color="error" variant="subtle" icon="i-ph-trash" @click="pendingDelete = file">
            {{ t('admin.gdprExports.delete') }}
          </UButton>
        </div>
      </li>
    </ul>

    <UModal :open="pendingDelete !== null" :title="t('admin.gdprExports.confirmTitle')" @update:open="(value: boolean) => { if (!value) pendingDelete = null }">
      <template #body>
        <p class="text-sm">{{ t('admin.gdprExports.confirmText', { name: pendingDelete?.name ?? '' }) }}</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="pendingDelete = null">{{ t('ui.cancel') }}</UButton>
          <UButton color="error" :loading="busy" @click="executeDelete">{{ t('admin.gdprExports.delete') }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
