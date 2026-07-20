<script setup lang="ts">
// Medien-Verwaltung (media.manage): Upload + Grid mit Publish-Toggle,
// Metadaten-Bearbeitung (Titel/Untertitel/Alt/featured) und Löschen.
// Öffentliche Konsumenten lesen /api/media (nur published).
import type { MediaItem } from '../../../shared/types/media'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'media.manage' })

const { t } = useI18n()
const toast = useToast()

// Verwaltungs-Sicht: ?all=1 (media.manage) liefert ALLE Einträge inkl.
// Entwürfe in voller Row-Form — die öffentliche Route zeigt nur published.
const { data, refresh } = await useFetch<{ items: (MediaItem & { src: string })[] }>('/api/media', { query: { all: 1 } })

const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)

async function upload(files: FileList | null) {
  if (!files?.length) return
  uploading.value = true
  try {
    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append('file', file)
      await $fetch('/api/media', { method: 'POST', body: form })
    }
    toast.add({ title: t('media.admin.uploaded', { count: files.length }), color: 'success' })
  }
  catch (error) {
    toast.add({ title: t('media.admin.uploadFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
    await refresh()
  }
}

const editing = ref<(MediaItem & { src: string }) | null>(null)
const editState = reactive({ title: '', subtitle: '', alt: '', featured: false })

function openEdit(item: MediaItem & { src: string }) {
  editing.value = item
  Object.assign(editState, { title: item.title, subtitle: item.subtitle, alt: item.alt, featured: item.featured })
}

async function saveEdit() {
  if (!editing.value) return
  try {
    await $fetch(`/api/media/${editing.value.$id}`, { method: 'PATCH', body: { ...editState } })
    toast.add({ title: t('media.admin.saved'), color: 'success' })
    editing.value = null
    await refresh()
  }
  catch {
    toast.add({ title: t('media.admin.saveFailed'), color: 'error' })
  }
}

async function togglePublished(item: MediaItem) {
  await $fetch(`/api/media/${item.$id}`, { method: 'PATCH', body: { published: !item.published } }).catch(() => {
    toast.add({ title: t('media.admin.saveFailed'), color: 'error' })
  })
  await refresh()
}

async function remove(item: MediaItem) {
  if (!confirm(t('media.admin.deleteConfirm', { title: item.title }))) return
  await $fetch(`/api/media/${item.$id}`, { method: 'DELETE' }).catch(() => {
    toast.add({ title: t('media.admin.deleteFailed'), color: 'error' })
  })
  await refresh()
}
</script>

<template>
  <UDashboardPanel id="media">
    <template #header>
      <UDashboardNavbar :title="t('media.admin.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <input ref="fileInput" type="file" accept=".jpg,.jpeg,.png,.webp" multiple class="hidden" data-media-file-input @change="upload(($event.target as HTMLInputElement).files)">
          <UButton icon="i-ph-upload-simple" :loading="uploading" data-media-upload @click="fileInput?.click()">
            {{ t('media.admin.upload') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p v-if="!data?.items.length" class="py-12 text-center text-sm text-muted" data-media-empty>
        {{ t('media.admin.empty') }}
      </p>

      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" data-media-grid>
        <div v-for="item in data.items" :key="item.$id" class="group relative overflow-hidden rounded-lg border border-default" :data-media-item="item.$id">
          <img :src="item.src" :alt="item.alt || item.title" class="aspect-square w-full object-cover" :class="item.published ? '' : 'opacity-40'" loading="lazy">
          <div class="p-2">
            <p class="truncate text-sm font-medium">{{ item.title }}</p>
            <p class="truncate text-xs text-muted">{{ item.subtitle || '—' }}</p>
            <div class="mt-2 flex items-center justify-between gap-1">
              <div class="flex items-center gap-1">
                <UBadge v-if="item.featured" size="sm" color="primary" variant="subtle">{{ t('media.admin.featured') }}</UBadge>
                <UBadge v-if="!item.published" size="sm" color="warning" variant="subtle">{{ t('media.admin.draft') }}</UBadge>
              </div>
              <div class="flex items-center">
                <UButton icon="i-ph-pencil-simple" size="xs" color="neutral" variant="ghost" :aria-label="t('media.admin.edit')" @click="openEdit(item)" />
                <UButton :icon="item.published ? 'i-ph-eye-slash' : 'i-ph-eye'" size="xs" color="neutral" variant="ghost" :aria-label="t('media.admin.togglePublished')" @click="togglePublished(item)" />
                <UButton icon="i-ph-trash" size="xs" color="error" variant="ghost" :aria-label="t('media.admin.delete')" @click="remove(item)" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <UModal :open="!!editing" :title="t('media.admin.editTitle')" @update:open="() => { editing = null }">
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('media.admin.fieldTitle')">
              <UInput v-model="editState.title" class="w-full" />
            </UFormField>
            <UFormField :label="t('media.admin.fieldSubtitle')" :hint="t('media.admin.fieldSubtitleHint')">
              <UInput v-model="editState.subtitle" class="w-full" />
            </UFormField>
            <UFormField :label="t('media.admin.fieldAlt')">
              <UInput v-model="editState.alt" class="w-full" />
            </UFormField>
            <USwitch v-model="editState.featured" :label="t('media.admin.fieldFeatured')" />
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { editing = null }">{{ t('media.admin.cancel') }}</UButton>
            <UButton data-media-save @click="saveEdit">{{ t('media.admin.save') }}</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
