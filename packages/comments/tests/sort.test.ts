import { describe, it, expect } from 'vitest'
import { hotness } from '../shared/sort'

const NOW = Date.parse('2026-07-08T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString()
const c = (score: number, ageHours: number) => ({ score, $createdAt: hoursAgo(ageHours) })

describe('hotness (Trending)', () => {
  it('gleicher Score: frischer schlägt älter', () => {
    expect(hotness(c(5, 1), NOW)).toBeGreaterThan(hotness(c(5, 24), NOW))
  })

  it('gleiches Alter: höherer Score schlägt niedrigeren', () => {
    expect(hotness(c(10, 3), NOW)).toBeGreaterThan(hotness(c(2, 3), NOW))
  })

  it('Zerfall: alter Top-Thread fällt hinter frischen soliden Thread', () => {
    expect(hotness(c(5, 1), NOW)).toBeGreaterThan(hotness(c(50, 72), NOW))
  })

  it('brandneu mit Score 0 rankt über altem Score 0 (+1-Zähler)', () => {
    expect(hotness(c(0, 0), NOW)).toBeGreaterThan(hotness(c(0, 48), NOW))
  })

  it('negativer Score rankt unter Score 0', () => {
    expect(hotness(c(-5, 1), NOW)).toBeLessThan(hotness(c(0, 1), NOW))
  })

  it('Zukunfts-Timestamps (Clock-Skew) crashen nicht — Alter wird auf 0 geklemmt', () => {
    const future = { score: 3, $createdAt: new Date(NOW + 3600_000).toISOString() }
    expect(Number.isFinite(hotness(future, NOW))).toBe(true)
    expect(hotness(future, NOW)).toBe(hotness(c(3, 0), NOW))
  })
})
