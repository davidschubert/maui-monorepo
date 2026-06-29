import { describe, it, expect } from 'vitest'
import { applyVoteDelta, nextVoteValue } from '../shared/vote'

describe('nextVoteValue (Toggle-Semantik)', () => {
  it('kein Vote + Klick → der geklickte Wert', () => {
    expect(nextVoteValue(null, 1)).toBe(1)
    expect(nextVoteValue(null, -1)).toBe(-1)
  })

  it('gleicher Vote nochmal → entfernt (null)', () => {
    expect(nextVoteValue(1, 1)).toBe(null)
    expect(nextVoteValue(-1, -1)).toBe(null)
  })

  it('anderer Vote → Wechsel', () => {
    expect(nextVoteValue(1, -1)).toBe(-1)
    expect(nextVoteValue(-1, 1)).toBe(1)
  })
})

describe('applyVoteDelta', () => {
  const base = { upvotes: 5, downvotes: 3 }

  it('neuer Upvote', () => {
    expect(applyVoteDelta(base, null, 1)).toEqual({ upvotes: 6, downvotes: 3, score: 3 })
  })

  it('neuer Downvote', () => {
    expect(applyVoteDelta(base, null, -1)).toEqual({ upvotes: 5, downvotes: 4, score: 1 })
  })

  it('Upvote zurücknehmen (toggle off)', () => {
    expect(applyVoteDelta(base, 1, null)).toEqual({ upvotes: 4, downvotes: 3, score: 1 })
  })

  it('von Up auf Down wechseln (beide Zähler)', () => {
    expect(applyVoteDelta(base, 1, -1)).toEqual({ upvotes: 4, downvotes: 4, score: 0 })
  })

  it('von Down auf Up wechseln', () => {
    expect(applyVoteDelta(base, -1, 1)).toEqual({ upvotes: 6, downvotes: 2, score: 4 })
  })

  it('score ist immer upvotes - downvotes', () => {
    const r = applyVoteDelta({ upvotes: 0, downvotes: 0 }, null, 1)
    expect(r.score).toBe(r.upvotes - r.downvotes)
  })

  it('Round-Trip: Up setzen und wieder entfernen ergibt den Ausgangsstand', () => {
    const afterUp = applyVoteDelta(base, null, 1)
    const back = applyVoteDelta(afterUp, 1, null)
    expect(back).toEqual({ ...base, score: base.upvotes - base.downvotes })
  })
})
