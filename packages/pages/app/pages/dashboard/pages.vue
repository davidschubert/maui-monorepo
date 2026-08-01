<script setup lang="ts">
import type { EditorToolbarItem, TableColumn } from '@nuxt/ui'
import { MAX_PAGE_BODY } from '../../../schemas/page'
import type { PageGroup, PageRow } from '../../../shared/types/page'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'pages.manage' })

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
useHead({ title: () => t('pages.admin.title') })

// EN = Standardsprache, DE = weiterer Reiter (weitere Sprachen später additiv)
const LOCALES = ['en', 'de'] as const
type Locale = (typeof LOCALES)[number]

// Markdown-Toolbar (identisch zum Changelog/Tickets-Muster)
const toolbarItems: EditorToolbarItem[] = [
  { kind: 'mark', mark: 'bold', icon: 'i-ph-text-b' },
  { kind: 'mark', mark: 'italic', icon: 'i-ph-text-italic' },
  { kind: 'heading', level: 2, icon: 'i-ph-text-h-two' },
  { kind: 'heading', level: 3, icon: 'i-ph-text-h-three' },
  { kind: 'bulletList', icon: 'i-ph-list-bullets' },
  { kind: 'orderedList', icon: 'i-ph-list-numbers' },
  { kind: 'link', icon: 'i-ph-link' },
  { kind: 'blockquote', icon: 'i-ph-quotes' },
]

const { data: listData, refresh: refreshList } = await useFetch<{ groups: PageGroup[] }>('/api/pages', { lazy: true, server: false })
const groups = computed(() => listData.value?.groups ?? [])

interface LocaleForm { title: string, body: string, published: boolean }
const emptyLocale = (): LocaleForm => ({ title: '', body: '', published: false })

const selectedSlug = ref<string | null>(null)
const isNew = ref(false)
const slugInput = ref('')
const activeLocale = ref<Locale>('en')
const forms = reactive<Record<Locale, LocaleForm>>({ en: emptyLocale(), de: emptyLocale() })
const saving = ref(false)

const editing = computed(() => isNew.value || selectedSlug.value !== null)
const localeTabs = computed(() => LOCALES.map(l => ({ label: t(`pages.admin.locale.${l}`), value: l })))
// Fußleiste + Zähler wirken auf die AKTIVE Sprachversion (Tab)
const activeForm = computed(() => forms[activeLocale.value])
const bodyTooLong = computed(() => activeForm.value.body.length > MAX_PAGE_BODY)

/**
 * Liste UND Editor auf einer Seite, aber nacheinander statt nebeneinander
 * (B6): vorher stand links ein 220-px-Menü, in dem der Slug die einzige
 * Information war. Jetzt zeigt die Seite eine Tabelle, bis eine Seite
 * ausgewählt ist — dann tritt der Editor an ihre Stelle. Dasselbe Muster wie
 * bei Kursen und Themes: Liste, dann Editor.
 */
const search = ref('')
const filteredGroups = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return groups.value
  return groups.value.filter(group => group.slug.toLowerCase().includes(needle)
    || group.locales.some(locale => locale.title.toLowerCase().includes(needle)))
})

const columns = computed<TableColumn<PageGroup>[]>(() => [
  { accessorKey: 'slug', header: () => t('pages.admin.col.address') },
  { id: 'title', header: () => t('pages.admin.col.pageTitle') },
  { id: 'locales', header: () => t('pages.admin.col.languages') },
  { id: 'actions', header: () => '' },
])

/** Anzeige-Titel: die Sprachversion der Oberfläche, sonst die erste vorhandene. */
function displayTitle(group: PageGroup): string {
  return group.locales.find(l => l.locale === 'en')?.title || group.locales[0]?.title || ''
}

function closeEditor() {
  isNew.value = false
  selectedSlug.value = null
  resetForms()
}

function resetForms() {
  for (const l of LOCALES) forms[l] = emptyLocale()
}

async function selectPage(slug: string) {
  isNew.value = false
  selectedSlug.value = slug
  slugInput.value = slug
  activeLocale.value = 'en'
  resetForms()
  try {
    const { rows } = await $fetch<{ rows: PageRow[] }>(`/api/pages/${slug}`)
    for (const row of rows) {
      if ((LOCALES as readonly string[]).includes(row.locale)) {
        forms[row.locale as Locale] = { title: row.title, body: row.body, published: row.status === 'published' }
      }
    }
  }
  catch {
    toast.add({ title: t('pages.admin.loadFailed'), description: t('pages.admin.loadFailedHint'), color: 'error' })
  }
}

function newPage() {
  isNew.value = true
  selectedSlug.value = null
  slugInput.value = ''
  activeLocale.value = 'en'
  resetForms()
}

async function saveActiveLocale() {
  const locale = activeLocale.value
  const slug = (isNew.value ? slugInput.value : selectedSlug.value ?? '').trim()
  if (!slug) {
    toast.add({ title: t('pages.admin.slugRequired'), color: 'error' })
    return
  }
  const form = forms[locale]
  if (!form.title.trim()) {
    // Dass der Titel PRO Sprachversion gilt, sieht man dem Reiter nicht an
    toast.add({ title: t('pages.admin.titleRequired'), description: t('pages.admin.titleRequiredHint'), color: 'error' })
    return
  }
  if (form.body.length > MAX_PAGE_BODY) {
    toast.add({
      title: t('pages.admin.bodyTooLong', { count: form.body.length.toLocaleString(), max: MAX_PAGE_BODY.toLocaleString() }),
      description: t('pages.admin.bodyTooLongHint'),
      color: 'error',
    })
    return
  }
  saving.value = true
  try {
    await $fetch('/api/pages', {
      method: 'PUT',
      body: { slug, locale, title: form.title, body: form.body, status: form.published ? 'published' : 'draft' },
    })
    // Gespeichert wird IMMER nur der aktive Reiter — ohne den Hinweis hält
    // man die anderen Sprachversionen für miterledigt.
    toast.add({
      title: t('pages.admin.saved'),
      description: t('pages.admin.savedHint', { language: t(`pages.admin.locale.${locale}`) }),
      color: 'success',
    })
    isNew.value = false
    selectedSlug.value = slug
    await refreshList()
  }
  catch {
    // Übersetzter Text statt rohem `statusMessage` (Audit-Befund C12) — s. die
    // gleichlautende Stelle in comments/dashboard/embed.vue.
    toast.add({
      title: t('pages.admin.saveFailed'),
      description: t('pages.admin.saveFailedHint'),
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

async function deletePage() {
  const slug = selectedSlug.value
  if (!slug) return
  try {
    const ok = await confirm({
      title: t('pages.admin.confirmDeleteTitle'),
      description: t('pages.admin.confirmDeleteText', { slug }),
      confirmLabel: t('pages.admin.delete'),
      // String-Konkatenation statt Template-Literal: das Literal matcht im
      // typed router AUCH /api/pages/public (GET-only, seit der Nav-Liste) —
      // der Methoden-Schnitt verbietet dann faelschlich DELETE.
      action: () => $fetch('/api/pages/' + encodeURIComponent(slug), { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({ title: t('pages.admin.deleted'), color: 'success' })
    // Nach dem Löschen zurück in die Liste — der Editor hätte kein Ziel mehr.
    closeEditor()
    await refreshList()
  }
  catch {
    toast.add({ title: t('pages.admin.deleteFailed'), description: t('pages.admin.deleteFailedHint'), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="pages">
    <template #header>
      <UDashboardNavbar :title="t('pages.admin.title')">
        <template #leading>
          <UButton
            v-if="editing"
            icon="i-ph-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('pages.admin.backToList')"
            @click="closeEditor"
          />
          <UDashboardSidebarCollapse v-else />
        </template>
        <template #right>
          <UButton v-if="!editing" icon="i-ph-plus" :label="t('pages.admin.new')" @click="newPage" />
        </template>
      </UDashboardNavbar>
    </template>

    <!-- #body ist der Scroll-Container des Panels — Menü + Formular scrollen hier,
         die Fußleiste (#footer) bleibt wie die Kopfleiste immer sichtbar. -->
    <template #body>
      <!-- Liste, solange keine Seite offen ist -->
      <template v-if="!editing">
        <UInput
          v-model="search"
          icon="i-ph-magnifying-glass"
          :placeholder="t('pages.admin.searchPlaceholder')"
          class="mb-4 max-w-md"
          data-pages-search
        />

        <UTable :data="filteredGroups" :columns="columns" data-pages-table>
          <template #slug-cell="{ row }">
            <button
              type="button"
              class="cursor-pointer font-mono font-medium text-default hover:text-primary hover:underline"
              @click="selectPage(row.original.slug)"
            >
              /{{ row.original.slug }}
            </button>
          </template>
          <template #title-cell="{ row }">
            <span class="text-sm">{{ displayTitle(row.original) }}</span>
          </template>
          <template #locales-cell="{ row }">
            <span class="flex flex-wrap gap-1">
              <UBadge
                v-for="loc in row.original.locales"
                :key="loc.$id"
                size="sm"
                :color="loc.status === 'published' ? 'success' : 'neutral'"
                variant="subtle"
              >{{ loc.locale }}</UBadge>
            </span>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-ph-pencil-simple"
                :label="t('pages.admin.edit')"
                @click="selectPage(row.original.slug)"
              />
            </div>
          </template>

          <template #empty>
            <CoreEmptyState
              v-if="search.trim()"
              icon="i-ph-funnel"
              :title="t('ui.empty.noResultsTitle')"
              :description="t('ui.empty.noResultsText')"
              :action-label="t('ui.empty.resetFilters')"
              action-icon="i-ph-arrow-counter-clockwise"
              @action="() => { search = '' }"
            />
            <CoreEmptyState
              v-else
              icon="i-ph-file-text"
              :title="t('pages.admin.emptyTitle')"
              :description="t('pages.admin.empty')"
              :action-label="t('pages.admin.new')"
              action-icon="i-ph-plus"
              @action="newPage"
            />
          </template>
        </UTable>
      </template>

      <div class="grid gap-6">
        <!-- Formular -->
        <div v-if="editing" class="min-w-0 space-y-4">
          <UFormField :label="t('pages.admin.slug')" :help="t('pages.admin.slugHelp')">
            <UInput v-model="slugInput" :disabled="!isNew" :placeholder="t('pages.admin.slugPlaceholder')" class="w-full font-mono" />
          </UFormField>

          <UTabs v-model="activeLocale" :items="localeTabs" class="w-full">
            <template #content="{ item }">
              <div class="space-y-3 pt-2">
                <UFormField :label="t('pages.admin.pageTitle')">
                  <UInput v-model="forms[item.value as Locale].title" class="w-full" />
                </UFormField>
                <UFormField :label="t('pages.admin.body')">
                  <UEditor
                    v-slot="{ editor }"
                    v-model="forms[item.value as Locale].body"
                    content-type="markdown"
                    class="w-full rounded-md border border-default"
                    :ui="{ base: 'px-3 py-2', content: 'min-h-64' }"
                  >
                    <UEditorToolbar :editor="editor" :items="toolbarItems" class="border-b border-default px-1.5 py-1" />
                  </UEditor>
                  <template #help>
                    <span :class="forms[item.value as Locale].body.length > MAX_PAGE_BODY ? 'text-error' : ''">
                      {{ t('pages.admin.charCount', { count: forms[item.value as Locale].body.length.toLocaleString(), max: MAX_PAGE_BODY.toLocaleString() }) }}
                    </span>
                  </template>
                </UFormField>
              </div>
            </template>
          </UTabs>
        </div>
      </div>
    </template>

    <!-- Fußleiste: wirkt auf die aktive Sprachversion (Tab) -->
    <template #footer>
      <div v-if="editing" class="flex items-center justify-between gap-3 border-t border-default px-4 py-3 sm:px-6">
        <USwitch v-model="forms[activeLocale].published" :label="t('pages.admin.published')" />
        <div class="flex items-center gap-2">
          <UButton
            v-if="selectedSlug"
            color="error"
            variant="soft"
            icon="i-ph-trash"
            :label="t('pages.admin.delete')"
            @click="deletePage"
          />
          <UButton :loading="saving" :disabled="bodyTooLong" :label="t('pages.admin.save')" @click="saveActiveLocale" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
