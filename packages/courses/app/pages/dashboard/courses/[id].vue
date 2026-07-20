<script setup lang="ts">
import { createLessonSchema } from '../../../../schemas/course'
import type { CourseRow, LessonRow } from '../../../../shared/types/course'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'courses.manage' })

/**
 * Kurs-Builder: Meta (Status/Publish), Lektionen anlegen/bearbeiten/
 * sortieren/publishen. useEditAwareness zeigt, wenn ein zweiter Admin
 * gerade denselben Kurs bearbeitet (Presence-Fundament).
 */
const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const localePath = useLocalePath()

const courseId = route.params.id as string
const { data: course, status, refresh } = await useFetch<CourseRow & { lessons: LessonRow[] }>(`/api/courses/${courseId}/manage`, {
  lazy: true,
  server: false,
})

useHead({ title: () => course.value?.title ?? t('courses.admin.title') })

// Edit-Awareness: „<Name> bearbeitet gerade" (Presence-Fundament, Core)
const { editors } = useEditAwareness(`course:${courseId}`)

const busy = ref(false)
async function setCourseStatus(target: 'draft' | 'published' | 'archived') {
  busy.value = true
  try {
    await $fetch(`/api/courses/${courseId}` as string, { method: 'PATCH', body: { status: target } })
    toast.add({ title: t('courses.admin.saved'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('courses.admin.saveFailed'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

// ---- Lektionen ----

const lessonModal = ref(false)
const lessonSaving = ref(false)
const editingLessonId = ref<string | null>(null)
const lessonForm = reactive({ title: '', content: '', videoUrl: '' })

function openLessonCreate() {
  editingLessonId.value = null
  Object.assign(lessonForm, { title: '', content: '', videoUrl: '' })
  lessonModal.value = true
}
function openLessonEdit(lesson: LessonRow) {
  editingLessonId.value = lesson.$id
  Object.assign(lessonForm, { title: lesson.title, content: lesson.content, videoUrl: lesson.videoUrl ?? '' })
  lessonModal.value = true
}

async function saveLesson() {
  const payload = { title: lessonForm.title, content: lessonForm.content, videoUrl: lessonForm.videoUrl.trim() || null }
  const parsed = createLessonSchema(t).safeParse(payload)
  if (!parsed.success) {
    toast.add({ title: parsed.error.issues[0]?.message ?? t('courses.admin.saveFailed'), color: 'error' })
    return
  }
  lessonSaving.value = true
  try {
    if (editingLessonId.value) {
      await $fetch(`/api/lessons/${editingLessonId.value}` as string, { method: 'PATCH', body: parsed.data })
    }
    else {
      await $fetch(`/api/courses/${courseId}/lessons`, { method: 'POST', body: parsed.data })
    }
    toast.add({ title: t('courses.admin.saved'), color: 'success' })
    lessonModal.value = false
    await refresh()
  }
  catch {
    toast.add({ title: t('courses.admin.saveFailed'), color: 'error' })
  }
  finally {
    lessonSaving.value = false
  }
}

const lessonBusyId = ref('')
async function toggleLessonStatus(lesson: LessonRow) {
  lessonBusyId.value = lesson.$id
  try {
    await $fetch(`/api/lessons/${lesson.$id}` as string, {
      method: 'PATCH',
      body: { status: lesson.status === 'published' ? 'draft' : 'published' },
    })
    await refresh()
  }
  catch {
    toast.add({ title: t('courses.admin.saveFailed'), color: 'error' })
  }
  finally {
    lessonBusyId.value = ''
  }
}

async function removeLesson(lesson: LessonRow) {
  lessonBusyId.value = lesson.$id
  try {
    await $fetch(`/api/lessons/${lesson.$id}` as string, { method: 'DELETE' })
    await refresh()
  }
  catch {
    toast.add({ title: t('courses.admin.saveFailed'), color: 'error' })
  }
  finally {
    lessonBusyId.value = ''
  }
}

/** Umsortieren per Hoch/Runter-Buttons (bewusst kein Drag&Drop, v1) */
async function moveLesson(index: number, delta: number) {
  const lessons = [...(course.value?.lessons ?? [])]
  const target = index + delta
  if (target < 0 || target >= lessons.length) return
  const [moved] = lessons.splice(index, 1)
  lessons.splice(target, 0, moved!)
  try {
    await $fetch(`/api/courses/${courseId}/reorder`, { method: 'POST', body: { lessonIds: lessons.map(l => l.$id) } })
    await refresh()
  }
  catch {
    toast.add({ title: t('courses.admin.saveFailed'), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="course-builder">
    <template #header>
      <UDashboardNavbar :title="course?.title ?? '…'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton :to="localePath('/dashboard/courses')" color="neutral" variant="ghost" size="sm" icon="i-ph-arrow-left">
            {{ t('courses.admin.backToList') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <ClientOnly>
        <template #fallback>
          <div class="flex justify-center py-16"><UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" /></div>
        </template>

        <div v-if="status === 'pending' && !course" class="flex justify-center py-16">
          <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
        </div>

        <template v-else-if="course">
          <UAlert
            v-if="editors.length > 0"
            color="warning" variant="subtle" icon="i-ph-users"
            :title="t('courses.admin.editingWarning', { name: editors[0] ?? '?' })"
            class="mb-4"
            data-testid="edit-awareness"
          />

          <div class="mb-6 flex flex-wrap items-center gap-2">
            <UBadge :color="course.status === 'published' ? 'success' : course.status === 'archived' ? 'neutral' : 'warning'" variant="subtle">
              {{ t(`courses.status.${course.status}`) }}
            </UBadge>
            <UBadge color="neutral" variant="outline">{{ t(`courses.access.${course.access}`) }}</UBadge>
            <span class="flex-1" />
            <UButton
              v-if="course.status !== 'published'"
              color="success" size="sm" icon="i-ph-paper-plane-tilt" :loading="busy"
              data-testid="course-publish"
              @click="setCourseStatus('published')"
            >
              {{ t('courses.admin.publish') }}
            </UButton>
            <UButton
              v-if="course.status === 'published'"
              color="neutral" variant="ghost" size="sm" icon="i-ph-eye-slash" :loading="busy"
              @click="setCourseStatus('draft')"
            >
              {{ t('courses.admin.unpublish') }}
            </UButton>
            <UButton
              v-if="course.status !== 'archived'"
              color="neutral" variant="ghost" size="sm" icon="i-ph-archive" :loading="busy"
              @click="setCourseStatus('archived')"
            >
              {{ t('courses.admin.archive') }}
            </UButton>
          </div>

          <div class="mb-3 flex items-center justify-between">
            <h2 class="font-semibold">{{ t('courses.admin.lessonsTitle', { count: course.lessons.length }) }}</h2>
            <UButton icon="i-ph-plus" size="sm" data-testid="lesson-create" @click="openLessonCreate">
              {{ t('courses.admin.addLesson') }}
            </UButton>
          </div>

          <p v-if="course.lessons.length === 0" class="py-8 text-center text-sm text-muted">
            {{ t('courses.admin.noLessons') }}
          </p>

          <ul v-else class="divide-y divide-default" data-testid="builder-lessons">
            <li v-for="(lesson, index) in course.lessons" :key="lesson.$id" class="flex items-center gap-2 py-2 text-sm">
              <div class="flex flex-col">
                <UButton color="neutral" variant="ghost" size="xs" icon="i-ph-caret-up" :disabled="index === 0" @click="moveLesson(index, -1)" />
                <UButton color="neutral" variant="ghost" size="xs" icon="i-ph-caret-down" :disabled="index === course.lessons.length - 1" @click="moveLesson(index, 1)" />
              </div>
              <span class="w-6 text-right text-muted">{{ index + 1 }}.</span>
              <span class="min-w-0 flex-1 truncate">{{ lesson.title }}</span>
              <UBadge :color="lesson.status === 'published' ? 'success' : 'warning'" variant="subtle" size="sm">
                {{ t(`courses.status.${lesson.status}`) }}
              </UBadge>
              <UButton
                :color="lesson.status === 'published' ? 'neutral' : 'success'"
                variant="ghost" size="xs"
                :icon="lesson.status === 'published' ? 'i-ph-eye-slash' : 'i-ph-paper-plane-tilt'"
                :loading="lessonBusyId === lesson.$id"
                :data-lesson-publish="lesson.$id"
                @click="toggleLessonStatus(lesson)"
              >
                {{ lesson.status === 'published' ? t('courses.admin.unpublish') : t('courses.admin.publish') }}
              </UButton>
              <UButton color="neutral" variant="ghost" size="xs" icon="i-ph-pencil-simple" @click="openLessonEdit(lesson)" />
              <UButton color="error" variant="ghost" size="xs" icon="i-ph-trash" :disabled="lessonBusyId === lesson.$id" @click="removeLesson(lesson)" />
            </li>
          </ul>
        </template>
      </ClientOnly>

      <UModal v-model:open="lessonModal" :title="editingLessonId ? t('courses.admin.editLesson') : t('courses.admin.addLesson')">
        <template #body>
          <form class="space-y-4" data-testid="lesson-form" @submit.prevent="saveLesson">
            <UFormField :label="t('courses.admin.form.title')" required>
              <UInput v-model="lessonForm.title" class="w-full" :maxlength="200" data-testid="lesson-form-title" />
            </UFormField>
            <UFormField :label="t('courses.admin.form.content')" :help="t('courses.admin.form.markdownHelp')" required>
              <UTextarea v-model="lessonForm.content" class="w-full" :rows="10" data-testid="lesson-form-content" />
            </UFormField>
            <UFormField :label="t('courses.admin.form.videoUrl')" :help="t('courses.admin.form.videoHelp')">
              <UInput v-model="lessonForm.videoUrl" type="url" class="w-full" :maxlength="500" placeholder="https://" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="ghost" @click="() => { lessonModal = false }">{{ t('ui.cancel') }}</UButton>
              <UButton type="submit" :loading="lessonSaving" data-testid="lesson-form-save">{{ t('courses.admin.form.save') }}</UButton>
            </div>
          </form>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
