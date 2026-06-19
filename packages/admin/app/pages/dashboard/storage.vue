<script setup lang="ts">
import type { StorageFileEntry, StorageOverview } from '../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
const toast = useToast()
const { formatRelativeTime } = useFormatRelativeTime()

const { data, status, refresh } = useFetch<StorageOverview>('/api/admin/storage', {
  lazy: true,
  server: false,
})

const pending = ref<{ kind: 'one', file: StorageFileEntry } | { kind: 'orphans' } | null>(null)
const busy = ref(false)

// Bucket-Auswahl — aktuell nur der konfigurierte Bucket; vorbereitet für mehrere
// (Auflisten aller Buckets bräuchte den buckets.read-Scope am Key).
const selectedBucket = ref('')
const bucketItems = computed(() => data.value?.bucketId ? [data.value.bucketId] : [])
watchEffect(() => {
  if (data.value?.bucketId && !selectedBucket.value) selectedBucket.value = data.value.bucketId
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileUrl(id: string): string {
  return `/api/storage/${data.value?.bucketId}/${id}?w=80&h=80&q=80`
}

async function deleteFile(id: string) {
  await $fetch(`/api/admin/storage/${id}`, { method: 'DELETE' })
}

async function executePending() {
  if (!pending.value) return
  busy.value = true
  try {
    if (pending.value.kind === 'one') {
      await deleteFile(pending.value.file.$id)
    }
    else {
      const orphans = data.value?.files.filter(f => f.orphan) ?? []
      for (const f of orphans) await deleteFile(f.$id)
    }
    toast.add({ title: t('admin.storage.deleted'), color: 'success' })
    pending.value = null
    await refresh()
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
  <UDashboardPanel id="storage">
    <template #header>
      <UDashboardNavbar :title="t('admin.storage.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="data?.available && data.orphanCount > 0"
            color="error" variant="subtle" icon="i-ph-broom"
            @click="pending = { kind: 'orphans' }"
          >
            {{ t('admin.storage.deleteOrphans', { count: data.orphanCount }) }}
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

        <div v-else class="space-y-4">
          <div class="flex flex-wrap items-center gap-4 text-sm text-muted">
            <div class="flex items-center gap-2">
              <span>{{ t('admin.storage.bucket') }}:</span>
              <USelectMenu v-model="selectedBucket" :items="bucketItems" :search-input="false" size="sm" class="min-w-40 font-mono" />
            </div>
            <span>{{ t('admin.storage.files') }}: <span class="font-bold text-default">{{ data.files.length }}</span></span>
            <span>{{ t('admin.storage.size') }}: <span class="font-bold text-default">{{ formatBytes(data.totalBytes) }}</span></span>
            <span>{{ t('admin.storage.orphans') }}: <span class="font-bold text-default">{{ data.orphanCount }}</span></span>
          </div>

          <p v-if="data.files.length === 0" class="text-sm text-muted">{{ t('admin.storage.empty') }}</p>

          <ul v-else class="divide-y divide-default">
            <li v-for="file in data.files" :key="file.$id" class="flex items-center gap-3 py-2">
              <img :src="fileUrl(file.$id)" :alt="file.name" class="size-10 shrink-0 rounded-md object-cover ring ring-default" loading="lazy">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ file.name }}</p>
                <p class="text-xs text-muted">{{ formatBytes(file.sizeBytes) }} · {{ formatRelativeTime(file.$createdAt) }}</p>
              </div>
              <UBadge v-if="file.orphan" color="warning" variant="subtle" size="sm">{{ t('admin.storage.orphan') }}</UBadge>
              <UButton color="error" variant="ghost" size="xs" icon="i-ph-trash" @click="pending = { kind: 'one', file }" />
            </li>
          </ul>
        </div>
      </ClientOnly>

      <UModal :open="pending !== null" :title="t('admin.storage.confirmTitle')" @update:open="(v: boolean) => { if (!v) pending = null }">
        <template #body>
          <p class="text-sm">
            {{ pending?.kind === 'orphans' ? t('admin.storage.confirmOrphans', { count: data?.orphanCount ?? 0 }) : t('admin.storage.confirmOne') }}
          </p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="pending = null">{{ t('comments.item.cancel') }}</UButton>
            <UButton color="error" :loading="busy" @click="executePending">{{ t('admin.users.confirmAction') }}</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
