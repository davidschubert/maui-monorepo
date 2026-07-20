<script setup lang="ts">
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

const pending = ref<{ kind: 'one', file: StorageFileEntry } | { kind: 'orphans' } | null>(null)
const busy = ref(false)

// Bucket-Wechsler über alle Buckets der Instanz (buckets.read)
const selectedBucket = ref('')
const bucketItems = computed(() => data.value?.buckets.map(b => b.id) ?? [])
watchEffect(() => {
  if (!selectedBucket.value && bucketItems.value.length > 0) selectedBucket.value = bucketItems.value[0]!
})
const current = computed<StorageBucketOverview | null>(
  () => data.value?.buckets.find(b => b.id === selectedBucket.value) ?? null,
)

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

async function executePending() {
  if (!pending.value) return
  busy.value = true
  try {
    if (pending.value.kind === 'one') {
      await deleteFile(pending.value.file.$id)
    }
    else {
      const orphans = current.value?.files.filter(f => f.orphan) ?? []
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
            v-if="current?.orphanAware && current.orphanCount > 0"
            color="error" variant="subtle" icon="i-ph-broom"
            @click="() => { pending = { kind: 'orphans' } }"
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

          <p v-if="current.files.length === 0" class="text-sm text-muted">{{ t('admin.storage.empty') }}</p>

          <ul v-else class="divide-y divide-default">
            <li v-for="file in current.files" :key="file.$id" class="flex items-center gap-3 py-2">
              <img v-if="previewUrl(file)" :src="previewUrl(file)!" :alt="file.name" class="size-10 shrink-0 rounded-md object-cover ring ring-default" loading="lazy">
              <div v-else class="flex size-10 shrink-0 items-center justify-center rounded-md bg-elevated ring ring-default">
                <UIcon :name="fileIcon(file)" class="size-5 text-muted" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ file.name }}</p>
                <p class="text-xs text-muted">{{ formatBytes(file.sizeBytes) }} · {{ formatRelativeTime(file.$createdAt) }}</p>
              </div>
              <UBadge v-if="file.orphan" color="warning" variant="subtle" size="sm">{{ t('admin.storage.orphan') }}</UBadge>
              <UButton v-if="!current.readOnly" color="error" variant="ghost" size="xs" icon="i-ph-trash" @click="() => { pending = { kind: 'one', file } }" />
            </li>
          </ul>
        </div>
      </ClientOnly>

      <UModal :open="pending !== null" :title="t('admin.storage.confirmTitle')" @update:open="(v: boolean) => { if (!v) pending = null }">
        <template #body>
          <div class="space-y-3">
            <p class="text-sm">
              {{ pending?.kind === 'orphans' ? t('admin.storage.confirmOrphans', { count: current?.orphanCount ?? 0 }) : t('admin.storage.confirmOne') }}
            </p>
            <UAlert
              v-if="pending?.kind === 'one' && current?.orphanAware && !pending.file.orphan"
              color="error"
              variant="subtle"
              icon="i-ph-warning-octagon"
              :title="t('admin.storage.linkedWarningTitle')"
              :description="t('admin.storage.linkedWarningText', { name: pending.file.linkedUserName })"
            />
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { pending = null }">{{ t('ui.cancel') }}</UButton>
            <UButton color="error" :loading="busy" @click="executePending">{{ t('admin.users.confirmAction') }}</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
