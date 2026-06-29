import { describe, it, expect } from 'vitest'
import { controversy } from '../shared/sort'

const c = (upvotes: number, downvotes: number, score = upvotes - downvotes) => ({ upvotes, downvotes, score })

describe('controversy', () => {
  it('keine Aktivität → 0', () => {
    expect(controversy(c(0, 0))).toBe(0)
  })

  it('ausgeglichen + viel Aktivität → hoch', () => {
    expect(controversy(c(10, 10))).toBe(20) // (10+10) / max(|0|,1)
  })

  it('einseitig → niedrig', () => {
    expect(controversy(c(10, 0))).toBe(1) // 10 / max(10,1)
  })

  it('|score| im Nenner — negativer Score zählt gleich', () => {
    expect(controversy(c(2, 8))).toBe(controversy(c(8, 2)))
    expect(controversy(c(2, 8))).toBeCloseTo(10 / 6)
  })

  it('kontrovers rankt über unkontrovers', () => {
    expect(controversy(c(50, 50))).toBeGreaterThan(controversy(c(100, 0)))
  })

  it('Nenner-Floor 1 verhindert Division durch 0 (score 0)', () => {
    expect(Number.isFinite(controversy(c(5, 5)))).toBe(true)
  })
})
