<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { createCategoryEditSchema, createCategorySchema } from '../../../schemas/postCategory'
import { slugify } from '../../../shared/discussionUrl'
import type { CategoryListResponse, CategoryWithCount, PostCategory } from '../../../shared/types/post'

/**
 * Kategorien der Discussions verwalten (F1 Stufe 1).
 *
 * PFAD vs. BESCHRIFTUNG: die Route heißt `/dashboard/discussions`, der
 * Menüpunkt „Kategorien". Der Pfad benennt den BEREICH (er wächst mit den
 * späteren Stufen — Views, Regelwerk, Badges), die Beschriftung benennt, was
 * heute darin steht. Ein Pfad, der `categories` heißt, müsste beim ersten
 * Ausbau umziehen und jeden Bookmark mitnehmen.
 *
 * Liste, dann Editor — dasselbe Muster wie Seiten, Kurse und Themes (B6):
 * UTable mit Sortierung und Leerzustand, und erst auf Klick tritt das Formular
 * an ihre Stelle. Bewusst KEIN Modal: die Seite hat genau eine Aufgabe, ein
 * Dialog darüber wäre eine Ebene ohne Gewinn.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'posts.manage' })

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
useHead({ title: () => t('posts.categories.title') })

const { data, status, refresh } = await useFetch<CategoryListResponse>('/api/posts/categories/manage', {
  lazy: true,
  server: false,
})
const rows = computed(() => data.value?.rows ?? [])

const search = ref('')
const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return rows.value
  return rows.value.filter(entry =>
    entry.category.name.toLowerCase().includes(needle)
    || entry.category.slug.includes(needle))
})

const columns = computed<TableColumn<CategoryWithCount>[]>(() => [
  { id: 'name', header: () => t('posts.categories.col.name') },
  { id: 'slug', header: () => t('posts.categories.col.slug') },
  { id: 'topics', header: () => t('posts.categories.col.topics') },
  { id: 'state', header: () => t('posts.categories.col.state') },
  { id: 'actions', header: () => '' },
])

// ── Formular ───────────────────────────────────────────────────────────────
interface Form { name: string, slug: string, description: string, sortOrder: number, active: boolean }
const emptyForm = (): Form => ({ name: '', slug: '', description: '', sortOrder: 0, active: true })

const form = reactive<Form>(emptyForm())
const editingId = ref<string | null>(null)
const isNew = ref(false)
const editing = computed(() => isNew.value || editingId.value !== null)
const saving = ref(false)

/**
 * Der Slug folgt dem Namen NUR beim Anlegen, und nur solange niemand ihn von
 * Hand angefasst hat. Danach nie wieder: er ist nach der Anlage fest (die
 * Kategorie-Seite trägt keine Id, über die sich ein alter Link heilen könnte).
 */
const slugTouched = ref(false)
watch(() => form.name, (value) => {
  if (isNew.value && !slugTouched.value) form.slug = slugify(value)
})

function startNew() {
  Object.assign(form, emptyForm())
  editingId.value = null
  isNew.value = true
  slugTouched.value = false
}

function startEdit(entry: CategoryWithCount) {
  Object.assign(form, {
    name: entry.category.name,
    slug: entry.category.slug,
    description: entry.category.description,
    sortOrder: entry.category.sortOrder,
    active: entry.category.active,
  })
  editingId.value = entry.category.$id
  isNew.value = false
  slugTouched.value = true
}

function closeEditor() {
  editingId.value = null
  isNew.value = false
  Object.assign(form, emptyForm())
}

/** Dieselben Zod-Schemas wie der Server — hier nur mit übersetzten Texten. */
const schema = computed(() => isNew.value ? createCategorySchema(t) : createCategoryEditSchema(t))
const formError = ref('')

async function save() {
  if (saving.value) return
  // `description` wird IMMER mitgeschickt, auch leer: der Server behandelt ein
  // fehlendes Feld als „unverändert" (shared/categoryPatch.ts) — wer den Text
  // löscht, muss die Löschung also aussprechen.
  const payload = {
    name: form.name.trim(),
    description: form.description.trim(),
    sortOrder: form.sortOrder,
    active: form.active,
    ...(isNew.value ? { slug: form.slug.trim() } : {}),
  }
  const parsed = schema.value.safeParse(payload)
  if (!parsed.success) {
    formError.value = parsed.error.issues[0]?.message ?? ''
    return
  }
  formError.value = ''

  saving.value = true
  try {
    if (isNew.value) {
      await $fetch('/api/posts/categories', { method: 'POST', body: parsed.data })
      toast.add({ title: t('posts.categories.created'), color: 'success' })
    }
    else {
      await $fetch(`/api/posts/categories/${editingId.value}`, { method: 'PATCH', body: parsed.data })
      toast.add({ title: t('posts.categories.updated'), color: 'success' })
    }
    closeEditor()
    await refresh()
  }
  catch (error) {
    // Der Server hebt fachliche Gründe als `reason` ins Envelope
    // (core/server/error.ts) — der Slug-Konflikt ist der einzige, den der
    // Mensch hier selbst beheben kann.
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    toast.add({
      title: reason === 'slug_taken' ? t('posts.categories.slugTaken') : t('posts.categories.saveFailed'),
      description: reason === 'slug_taken' ? undefined : t('posts.categories.saveFailedHint'),
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

async function remove(entry: CategoryWithCount) {
  try {
    const ok = await confirm({
      title: t('posts.categories.confirmDeleteTitle'),
      description: t('posts.categories.confirmDeleteText', { name: entry.category.name }),
      confirmLabel: t('posts.categories.delete'),
      action: () => $fetch(`/api/posts/categories/${entry.category.$id}`, { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({ title: t('posts.categories.deleted'), color: 'success' })
    await refresh()
  }
  catch (error) {
    // „In Benutzung" ist kein Fehlschlag, sondern die Antwort — mit dem einen
    // Weg, den es stattdessen gibt (stilllegen).
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    toast.add({
      title: reason === 'category_in_use' ? t('posts.categories.inUse') : t('posts.categories.deleteFailed'),
      description: reason === 'category_in_use'
        ? t('posts.categories.inUseHint')
        : t('posts.categories.deleteFailedHint'),
      color: reason === 'category_in_use' ? 'warning' : 'error',
    })
  }
}

/** Stilllegen/reaktivieren direkt aus der Liste — der häufigste Handgriff. */
async function toggleActive(entry: CategoryWithCount) {
  try {
    // Nur Name (Pflicht) und der Schalter — alles andere bleibt unangetastet,
    // weil ein fehlendes Feld „unverändert" heißt (shared/categoryPatch.ts).
    await $fetch(`/api/posts/categories/${entry.category.$id}`, {
      method: 'PATCH',
      body: { name: entry.category.name, active: !entry.category.active },
    })
    await refresh()
  }
  catch {
    toast.add({ title: t('posts.categories.saveFailed'), description: t('posts.categories.saveFailedHint'), color: 'error' })
  }
}

function categoryPath(category: PostCategory): string {
  return `/discussions/${category.slug}`
}
</script>

<template>
  <UDashboardPanel id="post-categories">
    <template #header>
      <UDashboardNavbar :title="t('posts.categories.title')">
        <template #leading>
          <UButton
            v-if="editing"
            icon="i-ph-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('posts.categories.cancel')"
            @click="closeEditor"
          />
          <UDashboardSidebarCollapse v-else />
        </template>
        <template #right>
          <UButton
            v-if="!editing"
            icon="i-ph-plus"
            :label="t('posts.categories.new')"
            data-category-new
            @click="startNew"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <template v-if="!editing">
        <p class="mb-4 text-sm text-muted">{{ t('posts.categories.description') }}</p>

        <UInput
          v-model="search"
          icon="i-ph-magnifying-glass"
          :placeholder="t('posts.discussions.searchCategories')"
          class="mb-4 max-w-md"
          data-category-search
        />

        <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
          <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
        </div>

        <UTable v-else :data="filtered" :columns="columns" data-categories-table>
          <template #name-cell="{ row }">
            <button
              type="button"
              class="cursor-pointer font-medium text-default hover:text-primary hover:underline"
              @click="startEdit(row.original)"
            >
              {{ row.original.category.name }}
            </button>
            <p v-if="row.original.category.description" class="max-w-md truncate text-sm text-muted">
              {{ row.original.category.description }}
            </p>
          </template>
          <template #slug-cell="{ row }">
            <NuxtLink
              :to="categoryPath(row.original.category)"
              class="font-mono text-sm text-muted hover:text-primary hover:underline"
            >
              /{{ row.original.category.slug }}
            </NuxtLink>
          </template>
          <template #topics-cell="{ row }">
            <span class="text-sm tabular-nums">{{ row.original.topicCount }}</span>
          </template>
          <template #state-cell="{ row }">
            <UBadge
              :color="row.original.category.active ? 'success' : 'neutral'"
              variant="subtle"
              size="sm"
            >
              {{ row.original.category.active ? t('posts.categories.stateActive') : t('posts.categories.stateInactive') }}
            </UBadge>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-1">
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                :icon="row.original.category.active ? 'i-ph-eye-slash' : 'i-ph-eye'"
                :aria-label="t('posts.categories.active')"
                @click="toggleActive(row.original)"
              />
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-ph-pencil-simple"
                :aria-label="t('posts.categories.edit')"
                @click="startEdit(row.original)"
              />
              <UButton
                color="error"
                variant="ghost"
                size="xs"
                icon="i-ph-trash"
                :aria-label="t('posts.categories.delete')"
                @click="remove(row.original)"
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
              icon="i-ph-chats-circle"
              :title="t('posts.categories.emptyTitle')"
              :description="t('posts.categories.emptyText')"
              :action-label="t('posts.categories.new')"
              action-icon="i-ph-plus"
              @action="startNew"
            />
          </template>
        </UTable>
      </template>

      <div v-else class="max-w-xl space-y-4" data-category-form>
        <UFormField :label="t('posts.categories.name')" required>
          <UInput v-model="form.name" :placeholder="t('posts.categories.namePlaceholder')" class="w-full" data-category-name />
        </UFormField>

        <UFormField
          :label="t('posts.categories.slug')"
          :help="isNew ? t('posts.categories.slugHint') : t('posts.categories.slugLocked')"
          required
        >
          <UInput
            v-model="form.slug"
            :disabled="!isNew"
            :placeholder="t('posts.categories.slugPlaceholder')"
            class="w-full font-mono"
            data-category-slug
            @update:model-value="() => { slugTouched = true }"
          />
        </UFormField>

        <UFormField :label="t('posts.categories.descriptionLabel')">
          <UTextarea
            v-model="form.description"
            :placeholder="t('posts.categories.descriptionPlaceholder')"
            :rows="2"
            autoresize
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('posts.categories.sortOrder')" :help="t('posts.categories.sortOrderHint')">
          <UInput v-model.number="form.sortOrder" type="number" :min="0" :max="9999" class="w-32" />
        </UFormField>

        <UFormField :label="t('posts.categories.active')" :help="t('posts.categories.activeHint')">
          <USwitch v-model="form.active" data-category-active />
        </UFormField>

        <UAlert v-if="formError" color="error" variant="subtle" icon="i-ph-warning" :title="formError" />

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="closeEditor">{{ t('posts.categories.cancel') }}</UButton>
          <UButton :loading="saving" :disabled="!form.name.trim()" data-category-save @click="save">
            {{ t('posts.categories.save') }}
          </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
