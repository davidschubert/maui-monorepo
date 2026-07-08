import { describe, expect, it } from 'vitest'
import { createCourseSchema, createLessonSchema, createReorderSchema } from '../schemas/course'

describe('createCourseSchema', () => {
  const schema = createCourseSchema()

  it('akzeptiert einen freien Kurs', () => {
    expect(schema.safeParse({ title: 'Theming 101', slug: 'theming-101', description: 'Grundlagen.', access: 'free' }).success).toBe(true)
  })

  it('paid verlangt entitlementFeature', () => {
    expect(schema.safeParse({ title: 'Pro-Kurs', slug: 'pro-kurs', description: 'x', access: 'paid' }).success).toBe(false)
    expect(schema.safeParse({ title: 'Pro-Kurs', slug: 'pro-kurs', description: 'x', access: 'paid', entitlementFeature: 'paidCourses' }).success).toBe(true)
  })

  it('validiert den Slug (url-sicher)', () => {
    expect(schema.safeParse({ title: 'X', slug: 'Hat Spaces', description: 'x', access: 'free' }).success).toBe(false)
    expect(schema.safeParse({ title: 'X', slug: 'ok-slug-9', description: 'x', access: 'free' }).success).toBe(true)
    expect(schema.safeParse({ title: 'X', slug: '-kaputt-', description: 'x', access: 'free' }).success).toBe(false)
  })

  it('lehnt unbekannten Zugang ab', () => {
    expect(schema.safeParse({ title: 'X', slug: 'x-y', description: 'x', access: 'vip' }).success).toBe(false)
  })
})

describe('createLessonSchema', () => {
  const schema = createLessonSchema()

  it('akzeptiert Markdown-Content bis 15k', () => {
    expect(schema.safeParse({ title: 'L1', content: '# Hallo\n- Punkt' }).success).toBe(true)
    expect(schema.safeParse({ title: 'L1', content: 'x'.repeat(15_001) }).success).toBe(false)
  })

  it('videoUrl optional, aber valide', () => {
    expect(schema.safeParse({ title: 'L1', content: 'x', videoUrl: 'https://youtu.be/abc' }).success).toBe(true)
    expect(schema.safeParse({ title: 'L1', content: 'x', videoUrl: 'kein-link' }).success).toBe(false)
  })
})

describe('createReorderSchema', () => {
  it('verlangt mindestens eine Id', () => {
    expect(createReorderSchema().safeParse({ lessonIds: [] }).success).toBe(false)
    expect(createReorderSchema().safeParse({ lessonIds: ['a', 'b'] }).success).toBe(true)
  })
})
