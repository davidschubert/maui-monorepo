import { describe, expect, it, vi } from 'vitest'
import { createMemoryRateLimitStore, createRedisRateLimitStore } from '../server/utils/rateLimitStore'

describe('createMemoryRateLimitStore (Fixed-Window)', () => {
  it('zählt hits im Fenster und peek liest ohne zu zählen', async () => {
    const store = createMemoryRateLimitStore()
    expect((await store.peek('k', 1000)).count).toBe(0)
    expect((await store.hit('k', 1000)).count).toBe(1)
    expect((await store.hit('k', 1000)).count).toBe(2)
    expect((await store.peek('k', 1000)).count).toBe(2)
  })
  it('Fenster läuft ab → Zähler beginnt neu', async () => {
    vi.useFakeTimers()
    try {
      const store = createMemoryRateLimitStore()
      await store.hit('k', 1000)
      vi.advanceTimersByTime(1001)
      expect((await store.peek('k', 1000)).count).toBe(0)
      expect((await store.hit('k', 1000)).count).toBe(1)
    }
    finally {
      vi.useRealTimers()
    }
  })
  it('Keys sind unabhängig', async () => {
    const store = createMemoryRateLimitStore()
    await store.hit('a', 1000)
    expect((await store.peek('b', 1000)).count).toBe(0)
  })
  it('resetInMs schrumpft mit der Zeit (Retry-After-Basis)', async () => {
    vi.useFakeTimers()
    try {
      const store = createMemoryRateLimitStore()
      const first = await store.hit('k', 60_000)
      vi.advanceTimersByTime(10_000)
      const later = await store.peek('k', 60_000)
      expect(later.resetInMs).toBeLessThan(first.resetInMs)
      expect(later.resetInMs).toBeGreaterThan(0)
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('createRedisRateLimitStore — fail-open', () => {
  it('toter Redis → In-Memory-Fallback drosselt weiter (kein Throw)', async () => {
    // Nicht-routbare TEST-NET-Adresse: Verbindung schlägt fehl, commandTimeout greift
    const store = createRedisRateLimitStore('redis://192.0.2.1:6399')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // großzügiges Fenster: die Redis-Timeouts (~1 s/Call) dürfen es nicht
      // ablaufen lassen, sonst testet man den Fenster-Reset statt des Fallbacks
      expect((await store.hit('k', 60_000)).count).toBe(1)
      expect((await store.hit('k', 60_000)).count).toBe(2)
      expect(warn).toHaveBeenCalled()
    }
    finally {
      warn.mockRestore()
    }
  }, 15_000)
})
