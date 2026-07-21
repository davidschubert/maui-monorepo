<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'
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

async function saveLocale(locale: Locale) {
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
  <div class="p-4 sm:p-6">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">{{ t('pages.admin.title') }}</h1>
        <p class="text-sm text-muted">{{ t('pages.admin.subtitle') }}</p>
      </div>
      <UButton icon="i-ph-plus" :label="t('pages.admin.new')" @click="newPage" />
    </div>

    <div class="grid gap-4 lg:grid-cols-[260px_1fr]">
      <!-- Menü: die Seiten -->
      <nav class="space-y-1">
        <UButton
          v-for="g in groups"
          :key="g.slug"
          :variant="selectedSlug === g.slug ? 'soft' : 'ghost'"
          color="neutral"
          block
          class="justify-between"
          @click="() => selectPage(g.slug)"
        >
          <span class="truncate font-mono text-sm">/{{ g.slug }}</span>
          <template #trailing>
            <span class="flex gap-1">
              <UBadge
                v-for="loc in g.locales"
                :key="loc.$id"
                size="sm"
                :color="loc.status === 'published' ? 'success' : 'neutral'"
                variant="subtle"
              >{{ loc.locale }}</UBadge>
            </span>
          </template>
        </UButton>
        <p v-if="!groups.length" class="px-2 py-4 text-sm text-muted">{{ t('pages.admin.empty') }}</p>
      </nav>

      <!-- Editor -->
      <UCard v-if="editing">
        <template #header>
          <UFormField :label="t('pages.admin.slug')" :help="t('pages.admin.slugHelp')">
            <UInput v-model="slugInput" :disabled="!isNew" placeholder="impressum" class="w-full font-mono" />
          </UFormField>
        </template>

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
              </UFormField>
              <div class="flex items-center justify-between border-t border-default pt-3">
                <USwitch v-model="forms[item.value as Locale].published" :label="t('pages.admin.published')" />
                <UButton :loading="saving" :label="t('pages.admin.save')" @click="() => saveLocale(item.value as Locale)" />
              </div>
            </div>
          </template>
        </UTabs>

        <template v-if="selectedSlug" #footer>
          <UButton color="error" variant="soft" icon="i-ph-trash" :label="t('pages.admin.delete')" @click="deletePage" />
        </template>
      </UCard>
      <div v-else class="flex items-center justify-center rounded-lg border border-dashed border-default p-12 text-center text-muted">
        {{ t('pages.admin.selectHint') }}
      </div>
    </div>
  </div>
</template>
