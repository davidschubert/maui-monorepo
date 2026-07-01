import { describe, it, expect } from 'vitest'
import { toOnlinePresences, PRESENCE_FRESH_MS, type RawServerPresence } from '../server/utils/presenceFilter'

const NOW = 1_700_000_000_000
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()

function raw(over: Partial<RawServerPresence> & { userId: string, agoMs: number }): RawServerPresence {
  const { agoMs, ...rest } = over
  return { $updatedAt: iso(agoMs), metadata: {}, ...rest }
}

describe('toOnlinePresences', () => {
  it('behält frische Presencen (< Frische-Fenster) und filtert veraltete', () => {
    const list = [
      raw({ userId: 'fresh', agoMs: 10_000 }),
      raw({ userId: 'edge', agoMs: PRESENCE_FRESH_MS - 1 }),
      raw({ userId: 'stale', agoMs: PRESENCE_FRESH_MS + 5_000 }),
    ]
    const ids = toOnlinePresences(list, NOW).map(p => p.userId)
    expect(ids).toEqual(['fresh', 'edge'])
  })

  it('mappt metadata sicher (userName/scope/action/typing)', () => {
    const [p] = toOnlinePresences([
      raw({ userId: 'u1', agoMs: 1_000, metadata: { userName: 'Uma', scope: 'post:demo', action: 'reviewing:comment:7', typing: true } }),
    ], NOW)
    expect(p).toMatchObject({ userId: 'u1', userName: 'Uma', scope: 'post:demo', action: 'reviewing:comment:7', typing: true })
  })

  it('setzt Defaults bei fehlenden/falsch getypten metadata', () => {
    const [p] = toOnlinePresences([
      raw({ userId: 'u2', agoMs: 1_000, metadata: { userName: 42, typing: 'yes' } as unknown as Record<string, unknown> }),
    ], NOW)
    expect(p.userName).toBe('')
    expect(p.scope).toBeUndefined()
    expect(p.typing).toBe(false)
  })

  it('respektiert ein eigenes Frische-Fenster', () => {
    const list = [raw({ userId: 'x', agoMs: 30_000 })]
    expect(toOnlinePresences(list, NOW, 20_000)).toHaveLength(0)
    expect(toOnlinePresences(list, NOW, 40_000)).toHaveLength(1)
  })
})
