<script setup lang="ts">
import { createLessonSchema } from '../../../../schemas/course'
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
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
const confirm = useConfirm()

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
    // „Gespeichert." sagt nicht, was der neue Status für Teilnehmende bedeutet —
    // genau das ist die Frage beim Zurückziehen und beim Archivieren.
    toast.add({
      title: t('courses.admin.saved'),
      description: t(`courses.admin.statusHint.${target}`),
      color: 'success',
    })
    await refresh()
  }
  catch {
    toast.add({ title: t('courses.admin.saveFailed'), description: t('courses.admin.statusFailedHint'), color: 'error' })
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
  const isNew = !editingLessonId.value
  try {
    if (editingLessonId.value) {
      await $fetch(`/api/lessons/${editingLessonId.value}` as string, { method: 'PATCH', body: parsed.data })
    }
    else {
      await $fetch(`/api/courses/${courseId}/lessons`, { method: 'POST', body: parsed.data })
    }
    // Eine NEUE Lektion ist ein Entwurf (lessons.post.ts: status ?? 'draft') —
    // ohne diesen Hinweis wartet man vergeblich darauf, dass sie im Kurs auftaucht.
    toast.add({
      title: t('courses.admin.saved'),
      description: isNew ? t('courses.admin.lessonCreatedHint') : undefined,
      color: 'success',
    })
    lessonModal.value = false
    await refresh()
  }
  catch {
    toast.add({ title: t('courses.admin.saveFailed'), description: t('courses.admin.lessonSaveFailedHint'), color: 'error' })
  }
  finally {
    lessonSaving.value = false
  }
}

const lessonBusyId = ref('')
async function toggleLessonStatus(lesson: LessonRow) {
  lessonBusyId.value = lesson.$id
  const publishing = lesson.status !== 'published'
  try {
    await $fetch(`/api/lessons/${lesson.$id}` as string, {
      method: 'PATCH',
      body: { status: publishing ? 'published' : 'draft' },
    })
    // Bis zum Audit-Befund C12 meldete sich diese Aktion NUR im Fehlerfall — der
    // Erfolg blieb stumm, obwohl er für Teilnehmende der sichtbarste Schritt ist.
    toast.add({
      title: t(publishing ? 'courses.admin.lessonPublished' : 'courses.admin.lessonUnpublished'),
      description: t(publishing ? 'courses.admin.lessonPublishedHint' : 'courses.admin.lessonUnpublishedHint'),
      color: 'success',
    })
    await refresh()
  }
  catch {
    toast.add({ title: t('courses.admin.saveFailed'), description: t('courses.admin.lessonStatusFailedHint'), color: 'error' })
  }
  finally {
    lessonBusyId.value = ''
  }
}

async function removeLesson(lesson: LessonRow) {
  try {
    const ok = await confirm({
      title: t('courses.admin.confirmDeleteLessonTitle'),
      description: t('courses.admin.confirmDeleteLessonText', { title: lesson.title }),
      confirmLabel: t('courses.admin.deleteLesson'),
      action: () => $fetch(`/api/lessons/${lesson.$id}` as string, { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({ title: t('courses.admin.lessonDeleted'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('courses.admin.saveFailed'), description: t('courses.admin.lessonDeleteFailedHint'), color: 'error' })
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
    // Ohne Rückmeldung war unklar, ob die neue Reihenfolge schon gespeichert ist:
    // die Tabelle springt erst nach dem refresh() um (keine optimistische Anzeige).
    toast.add({ title: t('courses.admin.reordered'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('courses.admin.saveFailed'), description: t('courses.admin.reorderFailedHint'), color: 'error' })
  }
}

/**
 * Auch die Lektionen sind eine Tabelle (B6). Die Reihenfolge IST hier eine
 * Aussage — deshalb bleibt die Nummer die erste Spalte und die Hoch/Runter-
 * Knöpfe bleiben sichtbar in der Zeile statt im Menü zu verschwinden.
 */
const HIDE_SM = { td: 'hidden sm:table-cell', th: 'hidden sm:table-cell' }

const lessonColumns = computed<TableColumn<LessonRow>[]>(() => [
  { id: 'order', header: () => t('courses.admin.col.order') },
  { accessorKey: 'title', header: () => t('courses.admin.col.lesson') },
  { accessorKey: 'status', header: () => t('courses.admin.col.status'), meta: { class: HIDE_SM } },
  { id: 'actions', header: () => '' },
])

function lessonActions(lesson: LessonRow): DropdownMenuItem[][] {
  return [
    [
      {
        label: lesson.status === 'published' ? t('courses.admin.unpublish') : t('courses.admin.publish'),
        icon: lesson.status === 'published' ? 'i-ph-eye-slash' : 'i-ph-paper-plane-tilt',
        onSelect: () => { void toggleLessonStatus(lesson) },
      },
      { label: t('courses.admin.editLesson'), icon: 'i-ph-pencil-simple', onSelect: () => openLessonEdit(lesson) },
    ],
    [{ label: t('courses.admin.deleteLesson'), icon: 'i-ph-trash', color: 'error', onSelect: () => { void removeLesson(lesson) } }],
  ]
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

          <UTable :data="course.lessons" :columns="lessonColumns" data-testid="builder-lessons">
            <template #order-cell="{ row }">
              <div class="flex items-center gap-1">
                <div class="flex flex-col">
                  <UButton
                    color="neutral" variant="ghost" size="xs" icon="i-ph-caret-up"
                    :aria-label="t('courses.admin.moveUp')"
                    :disabled="row.index === 0"
                    @click="moveLesson(row.index, -1)"
                  />
                  <UButton
                    color="neutral" variant="ghost" size="xs" icon="i-ph-caret-down"
                    :aria-label="t('courses.admin.moveDown')"
                    :disabled="row.index === course.lessons.length - 1"
                    @click="moveLesson(row.index, 1)"
                  />
                </div>
                <span class="w-6 text-right tabular-nums text-muted">{{ row.index + 1 }}.</span>
              </div>
            </template>
            <template #title-cell="{ row }">
              <span class="block max-w-md truncate font-medium">{{ row.original.title }}</span>
            </template>
            <template #status-cell="{ row }">
              <UBadge :color="row.original.status === 'published' ? 'success' : 'warning'" variant="subtle" size="sm">
                {{ t(`courses.status.${row.original.status}`) }}
              </UBadge>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end">
                <UDropdownMenu :items="lessonActions(row.original)" :content="{ align: 'end' }">
                  <UButton
                    icon="i-ph-dots-three-vertical"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :aria-label="t('courses.admin.lessonActions')"
                    :loading="lessonBusyId === row.original.$id"
                    :data-lesson-publish="row.original.$id"
                  />
                </UDropdownMenu>
              </div>
            </template>

            <template #empty>
              <CoreEmptyState
                icon="i-ph-list-numbers"
                :title="t('courses.admin.noLessonsTitle')"
                :description="t('courses.admin.noLessons')"
                :action-label="t('courses.admin.addLesson')"
                action-icon="i-ph-plus"
                @action="openLessonCreate"
              />
            </template>
          </UTable>
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
