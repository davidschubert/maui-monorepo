<script setup lang="ts">
import type { EditorToolbarItem, NavigationMenuItem } from '@nuxt/ui'
import { MAX_PAGE_BODY } from '../../../schemas/page'
import type { PageGroup, PageRow } from '../../../shared/types/page'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'pages.manage' })

const { t } = useI18n()
const toast = useToast()
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

// Seiten-Menü links (Muster: Dashboard-Nav) — active + Locale-Badges je Seite
const navItems = computed<NavigationMenuItem[]>(() => groups.value.map(group => ({
  label: `/${group.slug}`,
  value: group.slug,
  slot: 'page' as const,
  active: selectedSlug.value === group.slug,
  onSelect: () => { selectPage(group.slug) },
})))

// Slot-Items sind generisch typisiert — Locale-Badges über den value-Key auflösen
function localesForItem(item: { value?: string }): PageGroup['locales'] {
  return groups.value.find(group => group.slug === item.value)?.locales ?? []
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
    toast.add({ title: t('pages.admin.loadFailed'), color: 'error' })
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
    toast.add({ title: t('pages.admin.titleRequired'), color: 'error' })
    return
  }
  if (form.body.length > MAX_PAGE_BODY) {
    toast.add({
      title: t('pages.admin.bodyTooLong', { count: form.body.length.toLocaleString(), max: MAX_PAGE_BODY.toLocaleString() }),
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
    toast.add({ title: t('pages.admin.saved'), color: 'success' })
    isNew.value = false
    selectedSlug.value = slug
    await refreshList()
  }
  catch (error) {
    toast.add({ title: t('pages.admin.saveFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function deletePage() {
  const slug = selectedSlug.value
  if (!slug) return
  saving.value = true
  try {
    await $fetch(`/api/pages/${slug}`, { method: 'DELETE' })
    toast.add({ title: t('pages.admin.deleted'), color: 'success' })
    newPage()
    selectedSlug.value = null
    isNew.value = false
    await refreshList()
  }
  catch {
    toast.add({ title: t('pages.admin.deleteFailed'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="pages">
    <template #header>
      <UDashboardNavbar :title="t('pages.admin.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" :label="t('pages.admin.new')" @click="newPage" />
        </template>
      </UDashboardNavbar>
    </template>

    <!-- #body ist der Scroll-Container des Panels — Menü + Formular scrollen hier,
         die Fußleiste (#footer) bleibt wie die Kopfleiste immer sichtbar. -->
    <template #body>
      <div class="grid gap-6 lg:grid-cols-[220px_1fr]">
        <!-- Seiten-Navigation -->
        <UNavigationMenu
          orientation="vertical"
          :items="navItems"
          class="lg:sticky lg:top-0 lg:self-start"
        >
          <template #page-trailing="{ item }">
            <span class="flex gap-1">
              <UBadge
                v-for="loc in localesForItem(item)"
                :key="loc.$id"
                size="sm"
                :color="loc.status === 'published' ? 'success' : 'neutral'"
                variant="subtle"
              >{{ loc.locale }}</UBadge>
            </span>
          </template>
        </UNavigationMenu>
        <p v-if="!groups.length && !editing" class="text-sm text-muted lg:col-span-2">{{ t('pages.admin.empty') }}</p>

        <!-- Formular -->
        <div v-if="editing" class="min-w-0 space-y-4">
          <UFormField :label="t('pages.admin.slug')" :help="t('pages.admin.slugHelp')">
            <UInput v-model="slugInput" :disabled="!isNew" placeholder="imprint" class="w-full font-mono" />
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
        <div v-else-if="groups.length" class="flex items-center justify-center rounded-lg border border-dashed border-default p-12 text-center text-muted">
          {{ t('pages.admin.selectHint') }}
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
