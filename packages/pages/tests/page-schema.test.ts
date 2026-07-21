import { describe, expect, it } from 'vitest'
import { createPageUpsertSchema } from '../schemas/page'

const schema = createPageUpsertSchema()
const valid = { slug: 'imprint', locale: 'en', title: 'Imprint', body: '# Hi', status: 'published' as const }

describe('createPageUpsertSchema', () => {
  it('akzeptiert eine gültige Seite', () => {
    expect(schema.safeParse(valid).success).toBe(true)
  })
  it('lehnt ungültigen slug ab (Großbuchstaben / Slash)', () => {
    expect(schema.safeParse({ ...valid, slug: 'Impressum' }).success).toBe(false)
    expect(schema.safeParse({ ...valid, slug: 'a/b' }).success).toBe(false)
  })
  it('lehnt ungültigen Sprachcode ab', () => {
    expect(schema.safeParse({ ...valid, locale: 'english' }).success).toBe(false)
    expect(schema.safeParse({ ...valid, locale: 'de' }).success).toBe(true)
  })
  it('braucht einen Titel', () => {
    expect(schema.safeParse({ ...valid, title: '' }).success).toBe(false)
  })
  it('nur draft/published als Status', () => {
    expect(schema.safeParse({ ...valid, status: 'live' }).success).toBe(false)
    expect(schema.safeParse({ ...valid, status: 'draft' }).success).toBe(true)
  })
  it('verwirft unbekannte Felder (strict)', () => {
    expect(schema.safeParse({ ...valid, extra: 1 }).success).toBe(false)
  })
})
