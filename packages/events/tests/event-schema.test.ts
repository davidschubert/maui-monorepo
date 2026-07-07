import { describe, expect, it } from 'vitest'
import { createEventEditSchema, createEventSchema, createRsvpSchema } from '../schemas/event'

const base = {
  title: 'Community-Treffen',
  description: 'Wir treffen uns.',
  startAt: '2026-08-01T18:00:00.000Z',
}

describe('createEventSchema', () => {
  const schema = createEventSchema()

  it('akzeptiert ein minimales Event', () => {
    expect(schema.safeParse(base).success).toBe(true)
  })

  it('akzeptiert alle optionalen Felder', () => {
    expect(schema.safeParse({
      ...base,
      endAt: '2026-08-01T20:00:00.000Z',
      location: 'Clubraum',
      url: 'https://example.com/meet',
      capacity: 10,
      status: 'published',
    }).success).toBe(true)
  })

  it('lehnt leeren Titel und leere Beschreibung ab', () => {
    expect(schema.safeParse({ ...base, title: '  ' }).success).toBe(false)
    expect(schema.safeParse({ ...base, description: '' }).success).toBe(false)
  })

  it('lehnt endAt vor/gleich startAt ab', () => {
    expect(schema.safeParse({ ...base, endAt: '2026-08-01T17:00:00.000Z' }).success).toBe(false)
    expect(schema.safeParse({ ...base, endAt: base.startAt }).success).toBe(false)
  })

  it('lehnt ungültige URL und Kapazität < 1 ab', () => {
    expect(schema.safeParse({ ...base, url: 'kein-link' }).success).toBe(false)
    expect(schema.safeParse({ ...base, capacity: 0 }).success).toBe(false)
    expect(schema.safeParse({ ...base, capacity: 2.5 }).success).toBe(false)
  })

  it('lehnt status cancelled beim Anlegen ab (nur DELETE sagt ab)', () => {
    expect(schema.safeParse({ ...base, status: 'cancelled' }).success).toBe(false)
  })
})

describe('createEventEditSchema', () => {
  const schema = createEventEditSchema()

  it('akzeptiert Teil-Updates', () => {
    expect(schema.safeParse({ title: 'Neuer Titel' }).success).toBe(true)
    expect(schema.safeParse({ status: 'published' }).success).toBe(true)
    expect(schema.safeParse({ capacity: null }).success).toBe(true)
  })

  it('prüft endAt gegen startAt, wenn beide im Patch stehen', () => {
    expect(schema.safeParse({
      startAt: '2026-08-01T18:00:00.000Z',
      endAt: '2026-08-01T17:00:00.000Z',
    }).success).toBe(false)
  })

  it('lehnt status cancelled ab', () => {
    expect(schema.safeParse({ status: 'cancelled' }).success).toBe(false)
  })
})

describe('createRsvpSchema', () => {
  const schema = createRsvpSchema()

  it('akzeptiert nur going/maybe/declined', () => {
    expect(schema.safeParse({ status: 'going' }).success).toBe(true)
    expect(schema.safeParse({ status: 'maybe' }).success).toBe(true)
    expect(schema.safeParse({ status: 'declined' }).success).toBe(true)
    expect(schema.safeParse({ status: 'yes' }).success).toBe(false)
    expect(schema.safeParse({}).success).toBe(false)
  })
})
