<script setup lang="ts">
import type { EditorToolbarItem, FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { ChangelogEntry, ChangelogListResponse } from '../../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'changelog.manage' })

const { t, locale } = useI18n()
const toast = useToast()
const today = () => new Date().toISOString().slice(0, 10)
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale.value, { day: '2-digit', month: 'short', year: 'numeric' })

const { data, refresh } = useFetch<ChangelogListResponse>('/api/admin/changelog', { lazy: true, server: false })
const entries = computed(() => data.value?.entries ?? [])

// Edit-Awareness: zeigt, wenn ein anderer Admin die Changelog-Verwaltung offen hat.
const { editors } = useEditAwareness('changelog')

const CATEGORIES = ['feature', 'improvement', 'fix'] as const
function categoryColor(c: string) {
  return c === 'fix' ? 'error' : c === 'improvement' ? 'success' : 'primary'
}

// Markdown-Toolbar für die Body-Editoren (UEditor, content-type="markdown")
const toolbarItems: EditorToolbarItem[] = [
  { kind: 'mark', mark: 'bold', icon: 'i-ph-text-b' },
  { kind: 'mark', mark: 'italic', icon: 'i-ph-text-italic' },
  { kind: 'heading', level: 2, icon: 'i-ph-text-h-two' },
  { kind: 'heading', level: 3, icon: 'i-ph-text-h-three' },
  { kind: 'bulletList', icon: 'i-ph-list-bullets' },
  { kind: 'orderedList', icon: 'i-ph-list-numbers' },
  { kind: 'link', icon: 'i-ph-link' },
  { kind: 'blockquote', icon: 'i-ph-quotes' },
  { kind: 'codeBlock', icon: 'i-ph-code' },
]

const schema = z.object({
  // Englisch = Hauptsprache (Pflicht); Deutsch = optionale Alternative.
  titleEn: z.string().min(1, t('admin.changelog.form.titleRequired')).max(200),
  bodyEn: z.string().min(1, t('admin.changelog.form.bodyRequired')).max(5000),
  title: z.string().max(200),
  body: z.string().max(5000),
  category: z.enum(CATEGORIES),
  version: z.string().max(30),
  published: z.boolean(),
  date: z.string().min(1),
})
type FormInput = z.infer<typeof schema>
const categoryItems = computed(() => CATEGORIES.map(c => ({ label: t(`admin.changelog.category.${c}`), value: c })))

// Anzeige je UI-Sprache mit Fallback auf die jeweils andere
function localized(entry: ChangelogEntry, field: 'title' | 'body') {
  const en = field === 'title' ? entry.titleEn : entry.bodyEn
  const de = field === 'title' ? entry.title : entry.body
  return locale.value === 'en' ? (en || de) : (de || en)
}

const DEFAULTS = (): FormInput => ({ title: '', body: '', titleEn: '', bodyEn: '', category: 'feature', version: '', published: true, date: today() })

const open = ref(false)
const editingId = ref<string | null>(null)
const busy = ref(false)
const state = reactive<FormInput>(DEFAULTS())

function reset(values: Partial<FormInput> = {}) {
  Object.assign(state, DEFAULTS(), values)
}
function openCreate() {
  editingId.value = null
  reset()
  open.value = true
}
function openEdit(entry: ChangelogEntry) {
  editingId.value = entry.$id
  reset({ title: entry.title, body: entry.body, titleEn: entry.titleEn, bodyEn: entry.bodyEn, category: (entry.category || 'feature') as FormInput['category'], version: entry.version, published: entry.published, date: (entry.date || entry.$createdAt).slice(0, 10) })
  open.value = true
}

async function onSubmit(event: FormSubmitEvent<FormInput>) {
  busy.value = true
  // Datum (YYYY-MM-DD) → ISO-Zeitstempel für das Appwrite-datetime-Feld
  const body = { ...event.data, date: new Date(`${event.data.date}T12:00:00`).toISOString() }
  try {
    if (editingId.value) {
      await $fetch(`/api/admin/changelog/${editingId.value}`, { method: 'PATCH', body })
    }
    else {
      await $fetch('/api/admin/changelog', { method: 'POST', body })
    }
    toast.add({ title: t('admin.changelog.saved'), color: 'success' })
    open.value = false
    await refresh()
  }
  catch {
    toast.add({ title: t('admin.users.actionFailed'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

const pendingDelete = ref<ChangelogEntry | null>(null)
async function confirmDelete() {
  if (!pendingDelete.value) return
  busy.value = true
  try {
    await $fetch(`/api/admin/changelog/${pendingDelete.value.$id}`, { method: 'DELETE' })
    toast.add({ title: t('admin.changelog.deleted'), color: 'success' })
    pendingDelete.value = null
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
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <p class="text-sm text-muted">{{ t('admin.changelog.description') }}</p>
      <UButton icon="i-ph-plus" size="sm" @click="openCreate">{{ t('admin.changelog.new') }}</UButton>
    </div>

    <UAlert
      v-if="editors.length"
      color="warning"
      variant="subtle"
      icon="i-ph-users-three"
      :title="t('admin.presence.alsoEditing', { names: editors.join(', ') })"
      :description="t('admin.presence.alsoEditingHint')"
    />

    <p v-if="!entries.length" class="text-sm text-muted">{{ t('admin.changelog.empty') }}</p>

    <ul v-else class="space-y-3">
      <li v-for="entry in entries" :key="entry.$id" class="rounded-lg border border-default p-4">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge :color="categoryColor(entry.category)" variant="subtle" size="sm">{{ t(`admin.changelog.category.${entry.category || 'feature'}`) }}</UBadge>
          <span class="font-semibold">{{ localized(entry, 'title') }}</span>
          <UBadge v-if="entry.version" color="neutral" variant="subtle" size="sm">{{ entry.version }}</UBadge>
          <UBadge v-if="!entry.published" color="warning" variant="subtle" size="sm">{{ t('admin.changelog.draft') }}</UBadge>
          <UBadge v-if="!entry.titleEn || !entry.bodyEn" color="warning" variant="subtle" size="sm">{{ t('admin.changelog.missingEn') }}</UBadge>
          <span class="text-xs text-muted">{{ fmtDate(entry.date || entry.$createdAt) }}</span>
          <div class="ms-auto flex gap-1">
            <UButton size="xs" color="neutral" variant="ghost" icon="i-ph-pencil-simple" @click="openEdit(entry)">{{ t('admin.changelog.edit') }}</UButton>
            <UButton size="xs" color="error" variant="ghost" icon="i-ph-trash" @click="pendingDelete = entry">{{ t('admin.changelog.delete') }}</UButton>
          </div>
        </div>
        <p class="mt-2 whitespace-pre-line text-sm text-muted">{{ localized(entry, 'body') }}</p>
      </li>
    </ul>

    <UModal v-model:open="open" :title="editingId ? t('admin.changelog.editTitle') : t('admin.changelog.new')">
      <template #body>
        <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
          <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">{{ t('admin.changelog.form.langEn') }}</p>
          <UFormField :label="t('admin.changelog.form.title')" name="titleEn" required>
            <UInput v-model="state.titleEn" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.changelog.form.body')" name="bodyEn" required>
            <UEditor
              v-slot="{ editor }"
              v-model="state.bodyEn"
              content-type="markdown"
              class="w-full rounded-md border border-default"
              :ui="{ base: 'px-3 sm:px-3 py-2', content: 'min-h-32' }"
            >
              <UEditorToolbar :editor="editor" :items="toolbarItems" class="border-b border-default px-1.5 py-1" />
            </UEditor>
          </UFormField>

          <p class="border-t border-default pt-3 text-xs font-semibold uppercase tracking-wide text-dimmed">{{ t('admin.changelog.form.langDe') }}</p>
          <UFormField :label="t('admin.changelog.form.title')" name="title">
            <UInput v-model="state.title" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.changelog.form.body')" name="body" :help="t('admin.changelog.form.altHint')">
            <UEditor
              v-slot="{ editor }"
              v-model="state.body"
              content-type="markdown"
              class="w-full rounded-md border border-default"
              :ui="{ base: 'px-3 sm:px-3 py-2', content: 'min-h-32' }"
            >
              <UEditorToolbar :editor="editor" :items="toolbarItems" class="border-b border-default px-1.5 py-1" />
            </UEditor>
          </UFormField>

          <div class="flex flex-wrap gap-3 border-t border-default pt-3">
            <UFormField :label="t('admin.changelog.form.category')" name="category" class="flex-1">
              <USelect v-model="state.category" :items="categoryItems" class="w-full" />
            </UFormField>
            <UFormField :label="t('admin.changelog.form.version')" name="version" class="flex-1">
              <UInput v-model="state.version" placeholder="v1.4" class="w-full" />
            </UFormField>
            <UFormField :label="t('admin.changelog.form.date')" name="date" class="flex-1">
              <UInput v-model="state.date" type="date" class="w-full" />
            </UFormField>
          </div>
          <UFormField name="published">
            <USwitch v-model="state.published" :label="t('admin.changelog.form.published')" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="open = false">{{ t('comments.item.cancel') }}</UButton>
            <UButton type="submit" :loading="busy">{{ t('admin.changelog.save') }}</UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal :open="pendingDelete !== null" :title="t('admin.changelog.delete')" @update:open="(v: boolean) => { if (!v) pendingDelete = null }">
      <template #body>
        <p class="text-sm">{{ t('admin.changelog.confirmDelete', { title: pendingDelete ? localized(pendingDelete, 'title') : '' }) }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="pendingDelete = null">{{ t('comments.item.cancel') }}</UButton>
          <UButton color="error" :loading="busy" @click="confirmDelete">{{ t('admin.changelog.delete') }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
