<script setup lang="ts">
import type { CourseDetailResponse, LessonRow } from '../../shared/types/course'

/**
 * LessonView: Markdown XSS-sicher (Core-Sink), optionaler Video-Link
 * (generisches Icon — bewusst KEINE Provider-Erkennung aus dem events-Layer,
 * A14), „Lektion abschließen", Fortschritt, Prev/Next. Den #comments-Slot
 * füllt die APP mit CommentSection (targetType 'lesson').
 */
const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const localePath = useLocalePath()

const [{ data: lesson, error }, { data: course, refresh: refreshCourse }] = await Promise.all([
  useFetch<LessonRow & { courseSlug: string }>(`/api/lessons/${route.params.id}`),
  useFetch<CourseDetailResponse>(`/api/courses/${route.params.slug}`),
])
if (error.value || !lesson.value || !course.value) {
  throw createError({ status: 404, statusText: 'Lesson not found' })
}

useHead({ title: () => lesson.value?.title ?? '' })

const lessonIndex = computed(() => course.value!.lessons.findIndex(l => l.$id === lesson.value!.$id))
const prev = computed(() => (lessonIndex.value > 0 ? course.value!.lessons[lessonIndex.value - 1] : null))
const next = computed(() => (lessonIndex.value >= 0 && lessonIndex.value < course.value!.lessons.length - 1 ? course.value!.lessons[lessonIndex.value + 1] : null))
const isDone = computed(() => course.value!.completedLessonIds.includes(lesson.value!.$id))
const progressPercent = computed(() => {
  const c = course.value!
  return c.lessons.length === 0 ? 0 : Math.round((c.completedLessonIds.length / c.lessons.length) * 100)
})

const completing = ref(false)
async function complete() {
  completing.value = true
  try {
    const res = await $fetch<{ courseCompleted: boolean }>(`/api/lessons/${lesson.value!.$id}/complete`, { method: 'POST' })
    await refreshCourse()
    toast.add({
      title: res.courseCompleted ? t('courses.lesson.courseDone') : t('courses.lesson.done'),
      color: 'success',
    })
  }
  catch {
    toast.add({ title: t('courses.lesson.failed'), color: 'error' })
  }
  finally {
    completing.value = false
  }
}
</script>

<template>
  <UContainer class="max-w-3xl py-8">
    <UButton
      :to="localePath(`/courses/${route.params.slug}`)"
      color="neutral" variant="ghost" size="sm" icon="i-ph-arrow-left" class="mb-4"
    >
      {{ course!.title }}
    </UButton>

    <div class="mb-4 flex items-center gap-3">
      <UProgress :model-value="progressPercent" class="flex-1" />
      <span class="shrink-0 text-xs text-muted" data-testid="lesson-progress">{{ progressPercent }}%</span>
    </div>

    <h1 class="text-2xl font-bold">{{ lesson!.title }}</h1>

    <UButton
      v-if="lesson!.videoUrl"
      :href="lesson!.videoUrl" external target="_blank"
      color="neutral" variant="soft" size="sm" icon="i-ph-video-camera" class="mt-4"
      data-testid="lesson-video"
    >
      {{ t('courses.lesson.video') }}
    </UButton>

    <!-- Markdown ohne Raw-HTML (Core-Sink — Lehre aus dem CSS-Sink-Audit) -->
    <MarkdownContent :source="lesson!.content" class="mt-6 text-sm leading-relaxed" data-testid="lesson-content" />

    <div class="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4">
      <UButton
        v-if="prev"
        :to="localePath(`/courses/${route.params.slug}/lessons/${prev.$id}`)"
        color="neutral" variant="ghost" size="sm" icon="i-ph-caret-left"
      >
        {{ prev.title }}
      </UButton>
      <span v-else />

      <UButton
        :color="isDone ? 'neutral' : 'success'"
        :variant="isDone ? 'outline' : 'solid'"
        :icon="isDone ? 'i-ph-check-circle-fill' : 'i-ph-check'"
        :loading="completing"
        :disabled="isDone"
        data-testid="lesson-complete"
        @click="complete"
      >
        {{ isDone ? t('courses.lesson.doneBadge') : t('courses.lesson.complete') }}
      </UButton>

      <UButton
        v-if="next"
        :to="localePath(`/courses/${route.params.slug}/lessons/${next.$id}`)"
        color="neutral" variant="ghost" size="sm" trailing-icon="i-ph-caret-right"
      >
        {{ next.title }}
      </UButton>
      <span v-else />
    </div>

    <div class="mt-10">
      <slot name="comments" :lesson="lesson!" />
    </div>
  </UContainer>
</template>
