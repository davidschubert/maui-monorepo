<script setup lang="ts">
import { COMMUNITY_SUSPENDED_CODE } from '../../../../../core/shared/communitySuspension'
import { COURSE_PAID_UNAVAILABLE_CODE, COURSE_UPGRADE_REQUIRED_CODE, type CourseDetailResponse } from '../../../../shared/types/course'

definePageMeta({ middleware: ['auth'] })

/**
 * Kurs-Übersicht: Beschreibung (Markdown), Enroll-CTA je Zugang, Fortschritt,
 * Lektions-Liste (Content erst nach Enrollment).
 *
 * DREI ABLEHNUNGEN, DREI SÄTZE (Audit-Befund 2026-08-02). Vorher wurde JEDER
 * 403 zu „Dieser Kurs gehört zu Pro" mit einem Knopf auf /pricing — und damit
 * war die Meldung in zwei von drei Fällen falsch:
 *
 *  - Diese Instanz kann 'paid' gar nicht freischalten (kein Access-Guard, im
 *    Pool der Normalfall). Ein Upgrade-Knopf zeigte dort auf /pricing, das nur
 *    in billing lebt — die platform-App bindet den Layer nicht ein, der Klick
 *    endete im 404. Jetzt: ehrlicher Satz, KEIN Knopf.
 *  - Der Guard hat abgelehnt. Nur HIER hilft ein Upgrade wirklich — und nur
 *    hier gibt es die Seite auch, weil derselbe App-Verbund beides mitbringt.
 *  - Die Community ist gesperrt (M13). Dazu sagt diese Seite bewusst NICHTS:
 *    das globale Hinweis-Plugin (core, community-suspended-notice.client.ts)
 *    hat den Toast schon gezeigt, bevor dieser `catch` überhaupt läuft. Zwei
 *    Hinweise übereinander wären nicht doppelt hilfreich, sondern verwirrend —
 *    zumal der zweite eine Kaufaufforderung wäre, wo gerade eine Rechnung offen
 *    ist. So steht es auch im Kopf des Plugins: wer eine solche Stelle anfasst,
 *    prüft den Grund und schweigt dann.
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
/** Welcher Hinweis steht unter dem Knopf — nicht OB (siehe Kopf). */
const enrollBlock = ref<'upgrade' | 'unavailable' | null>(null)

async function enroll() {
  enrolling.value = true
  enrollBlock.value = null
  try {
    await $fetch(`/api/courses/${route.params.slug}/enroll`, { method: 'POST' })
    trackAnalyticsEvent('courseEnrolled')
    toast.add({ title: t('courses.detail.enrolled'), description: t('courses.detail.enrolledHint'), color: 'success' })
    await refresh()
  }
  catch (err) {
    // `data` ist das Fehler-Envelope des Servers ({ ok, code, message, reason }).
    const { statusCode, data } = err as { statusCode?: number, data?: { reason?: string } }
    const reason = statusCode === 403 ? data?.reason : undefined

    // Die Sperre erklärt das globale Plugin — hier bleibt es still.
    if (reason === COMMUNITY_SUSPENDED_CODE) return
    if (reason === COURSE_UPGRADE_REQUIRED_CODE) {
      enrollBlock.value = 'upgrade'
      return
    }
    if (reason === COURSE_PAID_UNAVAILABLE_CODE) {
      enrollBlock.value = 'unavailable'
      return
    }
    toast.add({ title: t('courses.detail.enrollFailed'), description: t('courses.detail.enrollFailedHint'), color: 'error' })
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
        <!-- Guard hat abgelehnt: hier führt ein Upgrade wirklich weiter -->
        <UAlert
          v-if="enrollBlock === 'upgrade'"
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
        <!-- Diese Instanz verkauft nichts: kein Knopf, weil es kein Ziel gibt -->
        <UAlert
          v-else-if="enrollBlock === 'unavailable'"
          class="mt-3"
          color="neutral" variant="subtle" icon="i-ph-info"
          :title="t('courses.detail.paidUnavailableTitle')"
          :description="t('courses.detail.paidUnavailableText')"
          data-testid="paid-unavailable-alert"
        />
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
