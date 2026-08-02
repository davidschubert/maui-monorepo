import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { isUnknownScopeColumnError, runScopedNotificationQuery } from '../server/utils/notificationScope'

/**
 * Nacht-Audit 2026-08-02, F34: `runScopedNotificationQuery` fing JEDEN Fehler
 * und wiederholte die Abfrage UNGESCOPT. Ein Timeout oder ein Appwrite-5xx
 * schaltete damit für die Dauer der Störung die Mandanten-Trennung der Glocke
 * ab — fremde Communities mischten sich hinein. Die Brücke war für den
 * Deploy-Fall „Spalte noch nicht migriert" gedacht; nur der darf sie auslösen.
 */

/** Ein Event, wie 00.tenant.ts es hinterlässt. */
function poolEvent(tenantId = 'kunde-a'): H3Event {
  return { context: { tenant: { mode: 'pool', projectId: 'pool', tenantId } } } as unknown as H3Event
}

/** Silo/Single-Tenant: gar kein Filter, also auch kein Rückfall-Pfad. */
function siloEvent(): H3Event {
  return { context: {} } as unknown as H3Event
}

/** So sieht der Appwrite-Fehler für eine unbekannte Spalte aus. */
function unknownColumnError(): Error & { code: number, type: string } {
  return Object.assign(
    new Error('Invalid query: Attribute not found in schema: communityId'),
    { code: 400, type: 'general_query_invalid' },
  )
}

describe('isUnknownScopeColumnError — nur die nicht migrierte Spalte', () => {
  it('erkennt Appwrites 400/general_query_invalid', () => {
    expect(isUnknownScopeColumnError(unknownColumnError())).toBe(true)
  })

  it('erkennt den Fall auch ohne Typ, über den Text — aber nur mit 400', () => {
    expect(isUnknownScopeColumnError(Object.assign(new Error('Unknown attribute: communityId'), { code: 400 }))).toBe(true)
    expect(isUnknownScopeColumnError(Object.assign(new Error('Unknown attribute: communityId'), { code: 500 }))).toBe(false)
  })

  it('BETRIEBSFEHLER sind es NICHT (der eigentliche Befund)', () => {
    const cases: unknown[] = [
      Object.assign(new Error('fetch failed'), { code: 500, type: 'general_unknown' }),
      Object.assign(new Error('Gateway timeout'), { code: 504 }),
      Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      Object.assign(new Error('Rate limit exceeded'), { code: 429, type: 'general_rate_limit_exceeded' }),
      Object.assign(new Error('Unauthorized'), { code: 401, type: 'general_unauthorized_scope' }),
      new Error('irgendwas'),
      'kaputt',
      null,
      undefined,
    ]
    for (const error of cases) expect(isUnknownScopeColumnError(error), String(error)).toBe(false)
  })
})

describe('runScopedNotificationQuery', () => {
  it('Normalfall: genau EIN gescopter Lauf', async () => {
    const run = vi.fn(async (queries: string[]) => queries)
    const queries = await runScopedNotificationQuery(poolEvent(), run)
    expect(run).toHaveBeenCalledTimes(1)
    expect(queries.length).toBe(1)
    expect(queries[0]).toContain('communityId')
  })

  it('Silo: leere Query-Liste, kein Rückfall-Pfad', async () => {
    const run = vi.fn(async (queries: string[]) => queries)
    expect(await runScopedNotificationQuery(siloEvent(), run)).toEqual([])
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('nicht migrierte Spalte: EIN ungescopter Wiederholungslauf (die Brücke bleibt)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let call = 0
    const run = vi.fn(async (queries: string[]) => {
      call++
      if (call === 1) throw unknownColumnError()
      return queries
    })
    expect(await runScopedNotificationQuery(poolEvent(), run)).toEqual([])
    expect(run).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('TIMEOUT/5xx: fliegt durch, KEIN ungescopter zweiter Lauf', async () => {
    const boom = Object.assign(new Error('Gateway timeout'), { code: 504 })
    const run = vi.fn(async () => { throw boom })
    await expect(runScopedNotificationQuery(poolEvent(), run)).rejects.toBe(boom)
    // Genau EIN Versuch — die Glocke bleibt lieber kaputt als gemischt.
    expect(run).toHaveBeenCalledTimes(1)
  })
})
