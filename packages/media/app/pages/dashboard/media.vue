<script setup lang="ts">
// Medien-Verwaltung (media.manage): Upload + Grid mit Publish-Toggle,
// Metadaten-Bearbeitung (Titel/Untertitel/Alt/featured) und Löschen.
// Öffentliche Konsumenten lesen /api/media (nur published).
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { MAX_MEDIA_BYTES } from '../../../shared/types/media'
import type { AdminMediaItem, MediaItem } from '../../../shared/types/media'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'media.manage' })

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const { formatDate } = useFormatDate()

useHead({ title: () => t('media.admin.title') })

// Verwaltungs-Sicht: ?all=1 (media.manage) liefert ALLE Einträge inkl.
// Entwürfe in voller Row-Form — die öffentliche Route zeigt nur published.
const { data, refresh } = await useFetch<{ items: AdminMediaItem[] }>('/api/media', { query: { all: 1 } })

// Suche und Sortierung laufen hier im BROWSER, nicht auf dem Server: die
// Route liefert die Mediathek in einem Rutsch (PAGE_LIMIT 100). Eine
// Server-Suche würde denselben Datensatz ein zweites Mal holen.
const search = ref('')
const { sortField, sortDir, toggle } = useTableSort('$createdAt', 'desc')

const rows = computed(() => {
  const needle = search.value.trim().toLowerCase()
  const list = (data.value?.items ?? []).filter(item => !needle
    || item.title.toLowerCase().includes(needle)
    || item.subtitle.toLowerCase().includes(needle)
    || item.alt.toLowerCase().includes(needle))
  const factor = sortDir.value === 'asc' ? 1 : -1
  return [...list].sort((a, b) => sortField.value === 'title'
    ? factor * a.title.localeCompare(b.title)
    : factor * (Date.parse(a.$createdAt) - Date.parse(b.$createdAt)))
})

const hasActiveFilter = computed(() => search.value.trim() !== '')
function resetFilters() {
  search.value = ''
}

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
  catch {
    // Der Hinweis nennt die einzige Regel, an der ein Upload hier praktisch
    // scheitert: Format und Größe. Der rohe `statusMessage` der Route stand
    // davor (Audit-Befund C12) — englischer Entwickler-Text in einem
    // Kunden-Dashboard, und unter HTTP/2 meist ohnehin leer.
    toast.add({
      title: t('media.admin.uploadFailed'),
      description: t('media.admin.uploadFailedHint', { max: Math.round(MAX_MEDIA_BYTES / (1024 * 1024)) }),
      color: 'error',
    })
  }
  finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
    await refresh()
  }
}

const editing = ref<AdminMediaItem | null>(null)
const editState = reactive({ title: '', subtitle: '', alt: '', featured: false })

function openEdit(item: AdminMediaItem) {
  editing.value = item
  Object.assign(editState, { title: item.title, subtitle: item.subtitle, alt: item.alt, featured: item.featured })
}

// `saving` sperrt den Speichern-Knopf gegen Doppelklicks (Audit-Befund C10)
const saving = ref(false)

async function saveEdit() {
  if (!editing.value || saving.value) return
  saving.value = true
  try {
    await $fetch(`/api/media/${editing.value.$id}`, { method: 'PATCH', body: { ...editState } })
    toast.add({ title: t('media.admin.saved'), color: 'success' })
    editing.value = null
    await refresh()
  }
  catch {
    toast.add({ title: t('media.admin.saveFailed'), description: t('media.admin.saveFailedHint'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function togglePublished(item: MediaItem) {
  const next = !item.published
  try {
    await $fetch(`/api/media/${item.$id}`, { method: 'PATCH', body: { published: next } })
    // Der Schalter allein sagt nicht, WER das Bild danach sieht — das gehört
    // in die Meldung, weil genau daran die Sichtbarkeit der Galerie hängt.
    toast.add({
      title: t(next ? 'media.admin.publishedToast' : 'media.admin.unpublishedToast'),
      description: t(next ? 'media.admin.publishedHint' : 'media.admin.unpublishedHint'),
      color: 'success',
    })
  }
  catch {
    toast.add({ title: t('media.admin.saveFailed'), description: t('media.admin.publishFailedHint'), color: 'error' })
  }
  await refresh()
}

async function remove(item: MediaItem) {
  try {
    const ok = await confirm({
      title: t('media.admin.deleteConfirmTitle'),
      description: t('media.admin.deleteConfirm', { title: item.title }),
      confirmLabel: t('media.admin.delete'),
      action: () => $fetch(`/api/media/${item.$id}`, { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({ title: t('media.admin.deleted'), color: 'success' })
  }
  catch {
    toast.add({ title: t('media.admin.deleteFailed'), description: t('media.admin.deleteFailedHint'), color: 'error' })
  }
  await refresh()
}

// Der visuelle Charakter bleibt: die erste Spalte ist das Bild. Untertitel
// und Datum fallen auf schmalen Schirmen weg.
const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const columns = computed<TableColumn<AdminMediaItem>[]>(() => [
  { id: 'preview', header: () => t('media.admin.col.preview') },
  { accessorKey: 'title', header: () => t('media.admin.col.title') },
  { accessorKey: 'subtitle', header: () => t('media.admin.col.subtitle'), meta: { class: HIDE_MD } },
  { id: 'state', header: () => t('media.admin.col.state') },
  { accessorKey: '$createdAt', header: () => t('media.admin.col.uploaded'), id: 'uploaded', meta: { class: HIDE_LG } },
  { id: 'actions', header: () => '' },
])

function rowActions(item: AdminMediaItem): DropdownMenuItem[][] {
  return [
    [
      { label: t('media.admin.edit'), icon: 'i-ph-pencil-simple', onSelect: () => openEdit(item) },
      {
        label: item.published ? t('media.admin.unpublish') : t('media.admin.publish'),
        icon: item.published ? 'i-ph-eye-slash' : 'i-ph-eye',
        onSelect: () => { void togglePublished(item) },
      },
    ],
    [
      { label: t('media.admin.delete'), icon: 'i-ph-trash', color: 'error', onSelect: () => { void remove(item) } },
    ],
  ]
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
      <UInput
        v-model="search"
        icon="i-ph-magnifying-glass"
        :placeholder="t('media.admin.searchPlaceholder')"
        class="mb-4 max-w-md"
        data-media-search
      />

      <!--
        Tabelle statt Kachel-Galerie (Davids Entscheidung 2026-07-28: EIN
        Konzept, überall). Der visuelle Charakter bleibt über die
        Vorschau-Spalte erhalten — das Bild ist die erste Spalte, nicht eine
        Zeile Text.
      -->
      <UTable :data="rows" :columns="columns" data-media-grid>
        <template #title-header>
          <SortableHeader :label="t('media.admin.col.title')" field="title" :active="sortField" :dir="sortDir" @toggle="toggle" />
        </template>
        <template #uploaded-header>
          <SortableHeader :label="t('media.admin.col.uploaded')" field="$createdAt" :active="sortField" :dir="sortDir" @toggle="toggle" />
        </template>

        <template #preview-cell="{ row }">
          <!-- Bild-Naht Schritt 2 (C14): feste 64-px-Kachel, also feste Maße
               statt `sizes` — @nuxt/image legt daraus 1× und 2× an. Der `src`
               aus /api/media ist bereits eine Vorschau-URL; der Anbieter liest
               Bucket und Datei daraus und rechnet die Größe neu. -->
          <NuxtImg
            provider="appwrite"
            :src="row.original.src"
            :width="64"
            :height="64"
            decoding="async"
            loading="lazy"
            :alt="row.original.alt || row.original.title"
            class="size-16 rounded-md border border-default object-cover"
            :class="row.original.published ? '' : 'opacity-40'"
            :data-media-item="row.original.$id"
          />
        </template>
        <template #title-cell="{ row }">
          <button
            type="button"
            class="cursor-pointer text-left font-medium text-default hover:text-primary hover:underline"
            @click="openEdit(row.original)"
          >
            {{ row.original.title }}
          </button>
        </template>
        <template #subtitle-cell="{ row }">
          <span class="text-sm text-muted">{{ row.original.subtitle || '—' }}</span>
        </template>
        <template #state-cell="{ row }">
          <div class="flex flex-wrap items-center gap-1">
            <UBadge v-if="row.original.featured" size="sm" color="primary" variant="subtle">{{ t('media.admin.featured') }}</UBadge>
            <UBadge :color="row.original.published ? 'success' : 'warning'" size="sm" variant="subtle">
              {{ row.original.published ? t('media.admin.published') : t('media.admin.draft') }}
            </UBadge>
          </div>
        </template>
        <template #uploaded-cell="{ row }">
          <span class="whitespace-nowrap text-sm text-muted">{{ formatDate(row.original.$createdAt) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
              <UButton
                icon="i-ph-dots-three-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="t('media.admin.rowActions')"
              />
            </UDropdownMenu>
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
          <!-- Galerie ohne Inhalt: der eine nächste Schritt ist der Upload -->
          <CoreEmptyState
            v-else
            icon="i-ph-images"
            :title="t('media.admin.emptyTitle')"
            :description="t('media.admin.empty')"
            :action-label="t('media.admin.upload')"
            action-icon="i-ph-upload-simple"
            data-media-empty
            @action="fileInput?.click()"
          />
        </template>
      </UTable>

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
            <UButton color="neutral" variant="ghost" :disabled="saving" @click="() => { editing = null }">{{ t('media.admin.cancel') }}</UButton>
            <UButton :loading="saving" :disabled="saving" data-media-save @click="saveEdit">{{ t('media.admin.save') }}</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
