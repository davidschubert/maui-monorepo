<script setup lang="ts">
/**
 * Individuelle Schriftarten (Admin): WOFF2-Uploads verwalten — Liste mit
 * Vorschau in der echten Schrift, Anlegen/Bearbeiten im Modal (Name +
 * Datei je Gewicht ODER eine Variable-Font-Datei), Sortierung, Löschen.
 * Die @font-face-Regeln für die Vorschau werden hier lokal in den Head
 * gerendert (App-weit übernimmt das das theme-Plugin, Paket 3).
 */
import type { DropdownMenuItem } from '@nuxt/ui'
import type { CustomFontDto } from '../../../../shared/fonts'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const fonts = useCustomFontsState()

await useAsyncData('maui-fonts-admin', async () => {
  await refreshCustomFonts()
  return true
})

// @font-face rendert das theme-Plugin app-weit aus demselben State —
// die Vorschau unten nutzt die Familien direkt, kein lokales CSS nötig.
const sortedFonts = computed(() => [...fonts.value].sort((a, b) => a.order - b.order))
const busy = ref(false)

const NAME_RE = /^[a-z0-9][a-z0-9 _-]{0,63}$/i
const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]
const WEIGHT_PICK_ORDER = [400, 700, 500, 600, 300, 200, 100, 800, 900]

// ── Editor (anlegen + bearbeiten) ──────────────────────────────────────────
interface FontFileRow { weight: number, fileId: string | null, uploading: boolean }
interface FontEditor { id: string | null, name: string, variable: boolean, rows: FontFileRow[] }

const editor = ref<FontEditor | null>(null)

function openCreate() {
  editor.value = { id: null, name: '', variable: false, rows: [{ weight: 400, fileId: null, uploading: false }] }
}

function openEdit(font: CustomFontDto) {
  const variable = font.files.some(file => file.variable)
  editor.value = {
    id: font.id,
    name: font.name,
    variable,
    rows: font.files.map(file => ({ weight: file.weight, fileId: file.fileId, uploading: false })),
  }
}

function toggleVariable(on: boolean) {
  if (!editor.value) return
  editor.value.variable = on
  // Variable Font = genau EINE Datei (deckt 100–900 ab)
  if (on) editor.value.rows = [editor.value.rows[0] ?? { weight: 400, fileId: null, uploading: false }]
}

function addRow() {
  if (!editor.value || editor.value.variable || editor.value.rows.length >= 9) return
  const used = new Set(editor.value.rows.map(row => row.weight))
  const weight = WEIGHT_PICK_ORDER.find(candidate => !used.has(candidate))
  if (weight === undefined) return
  editor.value.rows.push({ weight, fileId: null, uploading: false })
}

function removeRow(index: number) {
  if (!editor.value || editor.value.rows.length <= 1) return
  editor.value.rows.splice(index, 1)
}

async function uploadFile(row: FontFileRow, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  row.uploading = true
  try {
    const form = new FormData()
    form.append('file', file)
    const result = await $fetch<{ fileId: string }>('/api/admin/fonts/upload', { method: 'POST', body: form })
    row.fileId = result.fileId
  }
  catch {
    toast.add({ title: t('themes.fonts.uploadError'), color: 'error' })
  }
  finally {
    row.uploading = false
  }
}

const editorValid = computed(() => {
  const e = editor.value
  if (!e) return false
  if (!NAME_RE.test(e.name.trim())) return false
  if (!e.rows.length || e.rows.some(row => !row.fileId || row.uploading)) return false
  const weights = e.rows.map(row => row.weight)
  return new Set(weights).size === weights.length
})

async function saveEditor() {
  const e = editor.value
  if (!e || !editorValid.value) return
  busy.value = true
  try {
    const files = e.variable
      ? [{ weight: 400, fileId: e.rows[0]!.fileId!, variable: true }]
      : e.rows.map(row => ({ weight: row.weight, fileId: row.fileId! }))
    const body = { name: e.name.trim(), files }
    if (e.id) await $fetch(`/api/admin/fonts/${e.id}`, { method: 'PATCH', body })
    else await $fetch('/api/admin/fonts', { method: 'POST', body })
    await refreshCustomFonts()
    toast.add({ title: t('themes.fonts.saved'), color: 'success' })
    editor.value = null
  }
  catch (error) {
    const status = (error as { statusCode?: number })?.statusCode
    toast.add({ title: status === 422 ? t('themes.fonts.limit') : t('themes.studio.error'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

// ── Sortieren + Löschen ────────────────────────────────────────────────────
async function move(font: CustomFontDto, direction: -1 | 1) {
  const list = sortedFonts.value
  const index = list.findIndex(f => f.id === font.id)
  const neighbor = list[index + direction]
  if (!neighbor) return
  busy.value = true
  try {
    await $fetch(`/api/admin/fonts/${font.id}`, { method: 'PATCH', body: { order: neighbor.order } })
    await $fetch(`/api/admin/fonts/${neighbor.id}`, { method: 'PATCH', body: { order: font.order } })
    await refreshCustomFonts()
  }
  catch {
    toast.add({ title: t('themes.studio.error'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

const pendingDelete = ref<CustomFontDto | null>(null)

async function executeDelete() {
  if (!pendingDelete.value) return
  busy.value = true
  try {
    await $fetch(`/api/admin/fonts/${pendingDelete.value.id}`, { method: 'DELETE' })
    await refreshCustomFonts()
    toast.add({ title: t('themes.fonts.deleted'), color: 'success' })
    pendingDelete.value = null
  }
  catch {
    toast.add({ title: t('themes.studio.error'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

function fontMenu(font: CustomFontDto): DropdownMenuItem[][] {
  return [
    [
      { label: t('themes.fonts.edit'), icon: 'i-ph-pencil-simple', onSelect: () => openEdit(font) },
      { label: t('themes.studio.moveUp'), icon: 'i-ph-arrow-up', disabled: busy.value, onSelect: () => { void move(font, -1) } },
      { label: t('themes.studio.moveDown'), icon: 'i-ph-arrow-down', disabled: busy.value, onSelect: () => { void move(font, 1) } },
    ],
    [
      { label: t('themes.studio.delete'), icon: 'i-ph-trash', color: 'error', onSelect: () => { pendingDelete.value = font } },
    ],
  ]
}

function weightLabel(weight: number): string {
  if (weight === 400) return '400 · Regular'
  if (weight === 700) return '700 · Bold'
  return String(weight)
}
</script>

<template>
  <UDashboardPanel id="theme-fonts" :ui="{ body: 'lg:py-8' }">
    <template #header>
      <UDashboardNavbar :title="t('themes.fonts.title')">
        <template #leading>
          <UButton icon="i-ph-arrow-left" color="neutral" variant="ghost" :to="localePath('/dashboard/themes')" :aria-label="t('themes.studio.back')" />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" color="primary" @click="openCreate">
            {{ t('themes.fonts.add') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-3">
        <UAlert icon="i-ph-info" color="neutral" variant="subtle" :description="t('themes.fonts.hint')" />

        <p v-if="!sortedFonts.length" class="py-8 text-center text-sm text-muted">
          {{ t('themes.fonts.empty') }}
        </p>

        <UPageCard
          v-for="font in sortedFonts"
          :key="font.id"
          variant="subtle"
          :ui="{ container: 'min-w-0 p-4 sm:p-4' }"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 space-y-2">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <span class="truncate font-medium">{{ font.name }}</span>
                <UBadge
                  v-for="file in font.files"
                  :key="file.fileId"
                  color="neutral" variant="subtle" size="sm"
                >
                  {{ file.variable ? t('themes.fonts.variableBadge') : file.weight }}
                </UBadge>
              </div>
              <p class="truncate text-2xl" :style="{ fontFamily: `'${font.name}', sans-serif` }">
                {{ t('themes.fonts.previewText') }}
              </p>
            </div>
            <UDropdownMenu :items="fontMenu(font)" :content="{ align: 'end' }">
              <UButton
                icon="i-ph-dots-three-vertical" size="xs" color="neutral" variant="ghost"
                :aria-label="t('themes.studio.cardActions')"
              />
            </UDropdownMenu>
          </div>
        </UPageCard>
      </div>

      <!-- Editor-Modal: Name + WOFF2 je Gewicht ODER eine Variable-Font-Datei -->
      <UModal
        :open="editor !== null"
        :title="editor?.id ? t('themes.fonts.edit') : t('themes.fonts.add')"
        @update:open="(value: boolean) => { if (!value) editor = null }"
      >
        <template #body>
          <div v-if="editor" class="space-y-4">
            <UFormField :label="t('themes.fonts.name')" required :help="t('themes.fonts.nameHint')">
              <UInput v-model="editor.name" :maxlength="64" class="w-full" placeholder="Meine Hausschrift" />
            </UFormField>

            <USwitch
              :model-value="editor.variable"
              :label="t('themes.fonts.variable')"
              @update:model-value="toggleVariable"
            />

            <div class="space-y-2">
              <div v-for="(row, index) in editor.rows" :key="index" class="flex items-center gap-2">
                <USelect
                  v-if="!editor.variable"
                  v-model="row.weight"
                  :items="WEIGHTS.map(w => ({ label: weightLabel(w), value: w }))"
                  class="w-36"
                />
                <label class="flex-1">
                  <span
                    class="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm ring-1 ring-default transition hover:ring-accented"
                    :class="row.fileId ? 'text-default' : 'text-muted'"
                  >
                    <UIcon :name="row.uploading ? 'i-ph-circle-notch' : row.fileId ? 'i-ph-check-circle' : 'i-ph-upload-simple'" class="size-4 shrink-0" :class="row.uploading ? 'animate-spin' : row.fileId ? 'text-success' : ''" />
                    {{ row.uploading ? t('themes.fonts.uploading') : row.fileId ? t('themes.fonts.fileReady') : t('themes.fonts.chooseFile') }}
                  </span>
                  <input type="file" accept=".woff2" class="sr-only" @change="uploadFile(row, $event)">
                </label>
                <UButton
                  v-if="!editor.variable && editor.rows.length > 1"
                  icon="i-ph-x" size="xs" color="neutral" variant="ghost"
                  :aria-label="t('themes.studio.delete')"
                  @click="removeRow(index)"
                />
              </div>
              <UButton
                v-if="!editor.variable"
                icon="i-ph-plus" size="xs" color="neutral" variant="subtle"
                :disabled="editor.rows.length >= 9"
                @click="addRow"
              >
                {{ t('themes.fonts.addWeight') }}
              </UButton>
            </div>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { editor = null }">{{ t('ui.cancel') }}</UButton>
            <UButton color="primary" :disabled="!editorValid" :loading="busy" @click="saveEditor">{{ t('ui.save') }}</UButton>
          </div>
        </template>
      </UModal>

      <!-- Lösch-Bestätigung -->
      <UModal
        :open="pendingDelete !== null"
        :title="t('themes.fonts.deleteConfirmTitle')"
        @update:open="(value: boolean) => { if (!value) pendingDelete = null }"
      >
        <template #body>
          <p class="text-sm">{{ t('themes.fonts.deleteConfirmText', { name: pendingDelete?.name ?? '' }) }}</p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { pendingDelete = null }">{{ t('ui.cancel') }}</UButton>
            <UButton color="error" :loading="busy" @click="executeDelete">{{ t('themes.studio.delete') }}</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
