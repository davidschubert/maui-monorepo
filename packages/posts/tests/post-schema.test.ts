import { describe, expect, it } from 'vitest'
import { createPostSchema, createPostEditSchema, createVoteSchema } from '../schemas/post'
import { parsePollOptions } from '../server/utils/postsFeed'

const inFuture = (ms: number) => new Date(Date.now() + ms).toISOString()

describe('createPostSchema', () => {
  const schema = createPostSchema()

  it('akzeptiert einen einfachen Beitrag', () => {
    expect(schema.safeParse({ type: 'post', title: 'Hallo', body: 'Welt' }).success).toBe(true)
  })

  it('akzeptiert eine Frage ohne Titel', () => {
    expect(schema.safeParse({ type: 'question', body: 'Warum?' }).success).toBe(true)
  })

  it('lehnt leeren Body ab', () => {
    expect(schema.safeParse({ type: 'post', body: '   ' }).success).toBe(false)
  })

  it('lehnt unbekannten Typ ab', () => {
    expect(schema.safeParse({ type: 'event', body: 'x' }).success).toBe(false)
  })

  it('Poll: verlangt 2–6 Optionen', () => {
    const base = { type: 'poll', body: 'Abstimmen!' }
    expect(schema.safeParse({ ...base, pollOptions: ['nur eine'] }).success).toBe(false)
    expect(schema.safeParse({ ...base, pollOptions: ['a', 'b'] }).success).toBe(true)
    expect(schema.safeParse({ ...base, pollOptions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).success).toBe(false)
  })

  it('Poll: pollEndsAt muss in der Zukunft liegen', () => {
    const base = { type: 'poll', body: 'x', pollOptions: ['a', 'b'] }
    expect(schema.safeParse({ ...base, pollEndsAt: inFuture(60_000) }).success).toBe(true)
    expect(schema.safeParse({ ...base, pollEndsAt: inFuture(-60_000) }).success).toBe(false)
  })

  it('scheduledAt: Zukunft ja, Vergangenheit und >90 Tage nein', () => {
    const base = { type: 'post', body: 'x' }
    expect(schema.safeParse({ ...base, scheduledAt: inFuture(60_000) }).success).toBe(true)
    expect(schema.safeParse({ ...base, scheduledAt: inFuture(-60_000) }).success).toBe(false)
    expect(schema.safeParse({ ...base, scheduledAt: inFuture(91 * 24 * 3600_000) }).success).toBe(false)
  })

  it('Nicht-Polls können keine pollOptions einschleusen (Union verwirft sie)', () => {
    const parsed = schema.safeParse({ type: 'post', body: 'x', pollOptions: ['a', 'b'] })
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'pollOptions' in parsed.data).toBe(false)
  })
})

describe('createVoteSchema (Tampering)', () => {
  const schema = createVoteSchema()

  it('erlaubt nur Indizes 0–5', () => {
    expect(schema.safeParse({ optionIndex: 0 }).success).toBe(true)
    expect(schema.safeParse({ optionIndex: 5 }).success).toBe(true)
    expect(schema.safeParse({ optionIndex: -1 }).success).toBe(false)
    expect(schema.safeParse({ optionIndex: 6 }).success).toBe(false)
    expect(schema.safeParse({ optionIndex: 1.5 }).success).toBe(false)
    expect(schema.safeParse({ optionIndex: '1' }).success).toBe(false)
  })
})

describe('createPostEditSchema', () => {
  it('verlangt Body, Titel bleibt optional', () => {
    const schema = createPostEditSchema()
    expect(schema.safeParse({ body: 'neu' }).success).toBe(true)
    expect(schema.safeParse({ body: '' }).success).toBe(false)
  })
})

describe('parsePollOptions', () => {
  it('parst valides JSON-Array', () => {
    expect(parsePollOptions({ pollOptions: '["a","b"]' })).toEqual(['a', 'b'])
  })

  it('degradiert kaputtes JSON und Fremdtypen zu leer', () => {
    expect(parsePollOptions({ pollOptions: '{kaputt' })).toEqual([])
    expect(parsePollOptions({ pollOptions: '{"a":1}' })).toEqual([])
    expect(parsePollOptions({ pollOptions: null })).toEqual([])
  })

  it('filtert Nicht-Strings heraus', () => {
    expect(parsePollOptions({ pollOptions: '["a",42,null,"b"]' })).toEqual(['a', 'b'])
  })
})

describe('formatCount', () => {
  it('formatiert kompakt: 82 · 722 · 13.4K · 1.2M', async () => {
    const { formatCount } = await import('../app/utils/formatCount')
    expect(formatCount(0)).toBe('0')
    expect(formatCount(82)).toBe('82')
    expect(formatCount(722)).toBe('722')
    expect(formatCount(1000)).toBe('1K')
    expect(formatCount(13_400)).toBe('13.4K')
    expect(formatCount(134_000)).toBe('134K')
    expect(formatCount(1_200_000)).toBe('1.2M')
  })
})
