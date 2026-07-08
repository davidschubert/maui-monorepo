<script setup lang="ts">
import type { CourseDetailResponse } from '../../../../shared/types/course'

definePageMeta({ middleware: ['auth'] })

/**
 * Kurs-Übersicht: Beschreibung (Markdown), Enroll-CTA je Zugang (403 auf
 * paid ohne Entitlement → Upgrade-Hinweis mit /pricing-Link), Fortschritt,
 * Lektions-Liste (Content erst nach Enrollment).
 */
const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const localePath = useLocalePath()

const { data: course, error, refresh } = await useFetch<CourseDetailResponse>(`/api/courses/${route.params.slug}`)
if (error.value || !course.value) {
  throw createError({ status: 404, statusText: 'Course not found' })
}

useHead({ title: () => course.value?.title ?? '' })

const progressPercent = computed(() => {
  const c = course.value
  if (!c || c.lessons.length === 0) return 0
  return Math.round((c.completedLessonIds.length / c.lessons.length) * 100)
})

const enrolling = ref(false)
const upgradeNeeded = ref(false)
async function enroll() {
  enrolling.value = true
  upgradeNeeded.value = false
  try {
    await $fetch(`/api/courses/${route.params.slug}/enroll`, { method: 'POST' })
    toast.add({ title: t('courses.detail.enrolled'), color: 'success' })
    await refresh()
  }
  catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode === 403) {
      upgradeNeeded.value = true
    }
    else {
      toast.add({ title: t('courses.detail.enrollFailed'), color: 'error' })
    }
  }
  finally {
    enrolling.value = false
  }
}
</script>

<template>
  <UContainer class="max-w-3xl py-8">
    <UButton :to="localePath('/courses')" color="neutral" variant="ghost" size="sm" icon="i-ph-arrow-left" class="mb-4">
      {{ t('courses.detail.back') }}
    </UButton>

    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold">{{ course!.title }}</h1>
        <p v-if="course!.authorName" class="mt-1 text-sm text-muted">{{ t('courses.detail.by', { name: course!.authorName }) }}</p>
      </div>
      <UBadge :color="course!.access === 'paid' ? 'warning' : 'success'" variant="subtle">
        {{ t(`courses.access.${course!.access}`) }}
      </UBadge>
    </div>

    <MarkdownContent :source="course!.description" class="mt-4 text-sm leading-relaxed" data-testid="course-description" />

    <!-- Enroll / Fortschritt -->
    <div class="mt-6 rounded-xl border border-default p-4" data-testid="course-cta">
      <template v-if="!course!.enrolled">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-muted">{{ t('courses.detail.enrollHint') }}</p>
          <UButton :loading="enrolling" icon="i-ph-play" data-testid="enroll-button" @click="enroll">
            {{ course!.access === 'paid' ? t('courses.detail.enrollPaid') : t('courses.detail.enroll') }}
          </UButton>
        </div>
        <UAlert
          v-if="upgradeNeeded"
          class="mt-3"
          color="warning" variant="subtle" icon="i-ph-lock"
          :title="t('courses.detail.upgradeTitle')"
          :description="t('courses.detail.upgradeText')"
          data-testid="upgrade-alert"
        >
          <template #actions>
            <UButton :to="localePath('/pricing')" color="warning" variant="soft" size="sm">
              {{ t('courses.detail.upgradeCta') }}
            </UButton>
          </template>
        </UAlert>
      </template>
      <template v-else>
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-medium" data-testid="course-progress">
            {{ t('courses.detail.progress', { done: course!.completedLessonIds.length, total: course!.lessons.length, percent: progressPercent }) }}
          </p>
          <UBadge v-if="course!.completedAt" color="success" variant="subtle" data-testid="course-completed">
            {{ t('courses.detail.completed') }}
          </UBadge>
        </div>
        <UProgress :model-value="progressPercent" class="mt-2" />
      </template>
    </div>

    <!-- Lektionen -->
    <h2 class="mt-8 mb-2 font-semibold">{{ t('courses.detail.lessonsTitle', { count: course!.lessons.length }) }}</h2>
    <ol class="divide-y divide-default rounded-xl border border-default" data-testid="lesson-list">
      <li v-for="(lesson, index) in course!.lessons" :key="lesson.$id">
        <NuxtLink
          v-if="course!.enrolled"
          :to="localePath(`/courses/${course!.slug}/lessons/${lesson.$id}`)"
          class="flex items-center gap-3 p-3 text-sm transition-colors hover:bg-elevated/40"
        >
          <UIcon
            :name="course!.completedLessonIds.includes(lesson.$id) ? 'i-ph-check-circle-fill' : 'i-ph-circle'"
            class="size-5 shrink-0"
            :class="course!.completedLessonIds.includes(lesson.$id) ? 'text-success' : 'text-muted'"
          />
          <span class="text-muted">{{ index + 1 }}.</span>
          <span class="flex-1">{{ lesson.title }}</span>
          <UIcon name="i-ph-caret-right" class="size-4 text-muted" />
        </NuxtLink>
        <div v-else class="flex items-center gap-3 p-3 text-sm text-muted">
          <UIcon name="i-ph-lock" class="size-5 shrink-0" />
          <span>{{ index + 1 }}.</span>
          <span class="flex-1">{{ lesson.title }}</span>
        </div>
      </li>
      <li v-if="course!.lessons.length === 0" class="p-3 text-sm text-muted">{{ t('courses.detail.noLessons') }}</li>
    </ol>
  </UContainer>
</template>
