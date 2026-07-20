<script setup lang="ts">
import { createCourseSchema } from '../../../../schemas/course'
import type { CourseRow } from '../../../../shared/types/course'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'courses.manage' })

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()

useHead({ title: () => t('courses.admin.title') })

const { data, status } = await useFetch<{ rows: CourseRow[] }>('/api/courses/manage', {
  lazy: true,
  server: false,
})

const modalOpen = ref(false)
const saving = ref(false)
const form = reactive({ title: '', slug: '', description: '', access: 'free' as 'free' | 'members' | 'paid', entitlementFeature: '' })

/** Slug-Vorschlag aus dem Titel (editierbar) */
watch(() => form.title, (title) => {
  if (!form.slug || form.slug === slugify(form.title.slice(0, -1))) form.slug = slugify(title)
})
function slugify(value: string): string {
  return value.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
}

async function save() {
  const payload = {
    title: form.title,
    slug: form.slug,
    description: form.description,
    access: form.access,
    entitlementFeature: form.access === 'paid' ? (form.entitlementFeature.trim() || null) : null,
  }
  const parsed = createCourseSchema(t).safeParse(payload)
  if (!parsed.success) {
    toast.add({ title: parsed.error.issues[0]?.message ?? t('courses.admin.saveFailed'), color: 'error' })
    return
  }
  saving.value = true
  try {
    const row = await $fetch<CourseRow>('/api/courses', { method: 'POST', body: parsed.data })
    toast.add({ title: t('courses.admin.created'), color: 'success' })
    modalOpen.value = false
    await navigateTo(localePath(`/dashboard/courses/${row.$id}`))
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    toast.add({ title: statusCode === 409 ? t('courses.admin.slugTaken') : t('courses.admin.saveFailed'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

const statusColor = (row: CourseRow) =>
  row.status === 'published' ? 'success' as const : row.status === 'archived' ? 'neutral' as const : 'warning' as const
</script>

<template>
  <UDashboardPanel id="courses-admin">
    <template #header>
      <UDashboardNavbar :title="t('courses.admin.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" size="sm" data-testid="course-create" @click="() => { modalOpen = true }">
            {{ t('courses.admin.create') }}
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

        <p v-else-if="!data?.rows.length" class="py-16 text-center text-sm text-muted">
          {{ t('courses.admin.empty') }}
        </p>

        <ul v-else class="divide-y divide-default" data-testid="courses-admin-list">
          <li v-for="row in data.rows" :key="row.$id" class="flex items-center gap-3 py-3 text-sm">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ row.title }}</p>
              <p class="text-xs text-muted">/{{ row.slug }} · {{ t(`courses.access.${row.access}`) }} · {{ t('courses.list.lessons', { count: row.lessonCount }) }}</p>
            </div>
            <UBadge :color="statusColor(row)" variant="subtle" size="sm">{{ t(`courses.status.${row.status}`) }}</UBadge>
            <UButton
              color="neutral" variant="ghost" size="xs" icon="i-ph-pencil-simple"
              :to="localePath(`/dashboard/courses/${row.$id}`)"
              :data-course-edit="row.$id"
            >
              {{ t('courses.admin.edit') }}
            </UButton>
          </li>
        </ul>
      </ClientOnly>

      <UModal v-model:open="modalOpen" :title="t('courses.admin.createTitle')">
        <template #body>
          <form class="space-y-4" data-testid="course-form" @submit.prevent="save">
            <UFormField :label="t('courses.admin.form.title')" required>
              <UInput v-model="form.title" class="w-full" :maxlength="200" data-testid="course-form-title" />
            </UFormField>
            <UFormField :label="t('courses.admin.form.slug')" :help="t('courses.admin.form.slugHelp')" required>
              <UInput v-model="form.slug" class="w-full" :maxlength="100" data-testid="course-form-slug" />
            </UFormField>
            <UFormField :label="t('courses.admin.form.description')" :help="t('courses.admin.form.markdownHelp')" required>
              <UTextarea v-model="form.description" class="w-full" :rows="4" />
            </UFormField>
            <UFormField :label="t('courses.admin.form.access')">
              <div class="flex gap-1" data-testid="course-form-access">
                <UButton
                  v-for="option in (['free', 'members', 'paid'] as const)"
                  :key="option"
                  size="sm"
                  :color="form.access === option ? 'primary' : 'neutral'"
                  :variant="form.access === option ? 'soft' : 'ghost'"
                  @click="() => { form.access = option }"
                >
                  {{ t(`courses.access.${option}`) }}
                </UButton>
              </div>
            </UFormField>
            <UFormField
              v-if="form.access === 'paid'"
              :label="t('courses.admin.form.entitlement')"
              :help="t('courses.admin.form.entitlementHelp')"
              required
            >
              <UInput v-model="form.entitlementFeature" class="w-full" :maxlength="64" placeholder="paidCourses" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="ghost" @click="() => { modalOpen = false }">{{ t('ui.cancel') }}</UButton>
              <UButton type="submit" :loading="saving" data-testid="course-form-save">{{ t('courses.admin.form.save') }}</UButton>
            </div>
          </form>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
