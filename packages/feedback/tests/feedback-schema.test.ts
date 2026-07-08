import { describe, expect, it } from 'vitest'
import { createFeedbackSchema } from '../schemas/feedback'

describe('createFeedbackSchema', () => {
  const schema = createFeedbackSchema()

  it('akzeptiert gültiges Feedback', () => {
    expect(schema.safeParse({ category: 'idea', message: 'Mehr Events bitte!', page: '/events' }).success).toBe(true)
    expect(schema.safeParse({ category: 'bug', message: 'Der Kalender springt.' }).success).toBe(true)
  })

  it('lehnt unbekannte Kategorien ab', () => {
    expect(schema.safeParse({ category: 'rant', message: 'xxx' }).success).toBe(false)
  })

  it('verlangt mindestens ein paar Worte', () => {
    expect(schema.safeParse({ category: 'other', message: '  a ' }).success).toBe(false)
  })

  it('kappt überlange Nachrichten', () => {
    expect(schema.safeParse({ category: 'other', message: 'x'.repeat(2001) }).success).toBe(false)
    expect(schema.safeParse({ category: 'other', message: 'x'.repeat(2000) }).success).toBe(true)
  })
})
