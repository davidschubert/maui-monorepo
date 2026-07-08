import { z } from 'zod'
import { COURSE_ACCESS, MAX_COURSE_DESCRIPTION, MAX_COURSE_TITLE, MAX_LESSON_CONTENT } from '../shared/types/course'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

/** slug: url-sicher, stabil (a-z0-9-), 3–100 Zeichen */
const slugSchema = (t: TranslateFn) => z.string().trim().toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, t('courses.validation.slugInvalid'))
  .min(3, t('courses.validation.slugInvalid'))
  .max(100, t('courses.validation.slugInvalid'))

const courseFields = (t: TranslateFn) => ({
  title: z.string().trim().min(1, t('courses.validation.titleRequired')).max(MAX_COURSE_TITLE, t('courses.validation.titleMax')),
  slug: slugSchema(t),
  description: z.string().trim().min(1, t('courses.validation.descriptionRequired')).max(MAX_COURSE_DESCRIPTION, t('courses.validation.descriptionMax')),
  access: z.enum(COURSE_ACCESS),
  entitlementFeature: z.string().trim().max(64).nullish(),
})

/** access 'paid' verlangt das Entitlement-Feature (Guard-Ziel) */
function paidNeedsFeature(data: { access?: string, entitlementFeature?: string | null }): boolean {
  return data.access !== 'paid' || !!data.entitlementFeature
}

export function createCourseSchema(t: TranslateFn = identity) {
  return z.object({
    ...courseFields(t),
    status: z.enum(['draft', 'published']).optional(),
  }).refine(paidNeedsFeature, { message: t('courses.validation.paidNeedsFeature'), path: ['entitlementFeature'] })
}

export function createCourseEditSchema(t: TranslateFn = identity) {
  const f = courseFields(t)
  return z.object({
    title: f.title.optional(),
    slug: f.slug.optional(),
    description: f.description.optional(),
    access: f.access.optional(),
    entitlementFeature: f.entitlementFeature,
    status: z.enum(['draft', 'published', 'archived']).optional(),
    // paid-braucht-Feature prüft die Route gegen den MERGED Zustand
  })
}

export function createLessonSchema(t: TranslateFn = identity) {
  return z.object({
    title: z.string().trim().min(1, t('courses.validation.titleRequired')).max(MAX_COURSE_TITLE, t('courses.validation.titleMax')),
    content: z.string().trim().min(1, t('courses.validation.contentRequired')).max(MAX_LESSON_CONTENT, t('courses.validation.contentMax')),
    videoUrl: z.url(t('courses.validation.urlInvalid')).max(500).nullish(),
    status: z.enum(['draft', 'published']).optional(),
  })
}

export function createLessonEditSchema(t: TranslateFn = identity) {
  const base = createLessonSchema(t)
  return z.object({
    title: base.shape.title.optional(),
    content: base.shape.content.optional(),
    videoUrl: base.shape.videoUrl,
    status: base.shape.status,
  })
}

export function createReorderSchema(t: TranslateFn = identity) {
  return z.object({
    lessonIds: z.array(z.string().min(1)).min(1, t('courses.validation.orderRequired')).max(500),
  })
}

// Server-seitige Instanzen (Fehlertexte = Keys; die UI validiert mit t())
export const courseSchema = createCourseSchema()
export const courseEditSchema = createCourseEditSchema()
export const lessonSchema = createLessonSchema()
export const lessonEditSchema = createLessonEditSchema()
export const reorderSchema = createReorderSchema()
