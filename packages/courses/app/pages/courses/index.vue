<script setup lang="ts">
import type { CourseListResponse } from '../../../shared/types/course'

definePageMeta({ middleware: ['auth'] })

/** Kurs-Galerie (Mitglieder): Karten mit Zugang-Badge + Enrolled-Status. */
const { t } = useI18n()
const localePath = useLocalePath()

useHead({ title: () => t('courses.list.title') })

const { data, status } = await useFetch<CourseListResponse>('/api/courses')

const accessColor = (access: string) =>
  access === 'paid' ? 'warning' as const : access === 'members' ? 'info' as const : 'success' as const
</script>

<template>
  <UContainer class="max-w-4xl py-8">
    <h1 class="text-2xl font-bold">{{ t('courses.list.title') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('courses.list.description') }}</p>

    <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
      <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
    </div>

    <p v-else-if="!data?.rows.length" class="py-16 text-center text-sm text-muted" data-testid="courses-empty">
      {{ t('courses.list.empty') }}
    </p>

    <div v-else class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="courses-list">
      <NuxtLink
        v-for="course in data.rows"
        :key="course.$id"
        :to="localePath(`/courses/${course.slug}`)"
        class="flex flex-col rounded-xl border border-default p-5 transition-colors hover:bg-elevated/40"
        :data-course-card="course.slug"
      >
        <div class="flex items-center gap-2">
          <h2 class="flex-1 font-semibold">{{ course.title }}</h2>
          <UBadge :color="accessColor(course.access)" variant="subtle" size="sm">
            {{ t(`courses.access.${course.access}`) }}
          </UBadge>
          <UBadge v-if="course.enrolled" color="success" variant="subtle" size="sm" data-testid="enrolled-badge">
            {{ t('courses.list.enrolled') }}
          </UBadge>
        </div>
        <p class="mt-2 line-clamp-3 flex-1 text-sm text-muted">{{ course.description }}</p>
        <p class="mt-3 flex items-center gap-3 text-xs text-muted">
          <span class="inline-flex items-center gap-1">
            <UIcon name="i-ph-list-numbers" class="size-4" />
            {{ t('courses.list.lessons', { count: course.lessonCount }) }}
          </span>
          <span v-if="course.authorName" class="inline-flex items-center gap-1">
            <UIcon name="i-ph-user" class="size-4" />
            {{ course.authorName }}
          </span>
        </p>
      </NuxtLink>
    </div>
  </UContainer>
</template>
