import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * F1 Stufe 4 — die Ereignis-Zählung je Nutzer.
 *
 * Wie beim Aktivitäts-Vertrag benutzt das Modul `logEvent` als Nuxt-
 * AUTO-IMPORT; im Test gibt es keinen, also liegt es vorher auf `globalThis`.
 * Gebraucht wird es für den wichtigsten Fall: die kaputte Quelle.
 */
const logEvent = vi.fn()
;(globalThis as unknown as { logEvent: unknown }).logEvent = logEvent

const {
  COUNTER_FLAGS_RAISED,
  COUNTER_LIKES_GIVEN,
  __resetUserCounterProviders,
  collectUserCounters,
  counterLikedItems,
  counterLikedReplies,
  counterLikedTopics,
  mergeUserCounters,
  registerUserCounterProvider,
  registeredUserCounterProviders,
} = await import('../server/utils/userCounters')

/** Ein Request MIT angemeldetem Nutzer — ohne einen zählt der Vertrag nichts. */
const event = { context: { user: { $id: 'u1' } } } as unknown as H3Event
const query = { thresholds: [1, 5] }

beforeEach(() => {
  __resetUserCounterProviders()
  logEvent.mockClear()
})

describe('die Zähler-Namen', () => {
  it('trennt Beiträge und Antworten, ohne dass eine Seite die andere kennt', () => {
    // Der eigentliche Zweck der Bauer: `posts` schreibt `likedTopics`,
    // `comments` schreibt `likedReplies` — und keiner der beiden nennt je den
    // anderen Layer. Kollidieren dürfen die Namen dabei nicht.
    expect(counterLikedTopics(10)).not.toBe(counterLikedReplies(10))
    expect(counterLikedItems(10)).not.toBe(counterLikedTopics(10))
  })

  it('unterscheidet Schwellen', () => {
    expect(counterLikedItems(1)).not.toBe(counterLikedItems(2))
  })
})

describe('mergeUserCounters — die Summe über alle Quellen', () => {
  it('addiert denselben Zähler aus verschiedenen Quellen', () => {
    // Genau das ist der Fall „vergebene Upvotes": posts zählt die auf
    // Beiträgen, comments die auf Antworten — gemeint ist die Summe.
    const merged = mergeUserCounters([
      { [COUNTER_LIKES_GIVEN]: 3 },
      { [COUNTER_LIKES_GIVEN]: 4 },
    ])

    expect(merged[COUNTER_LIKES_GIVEN]).toBe(7)
  })

  it('lässt Zähler stehen, die nur EINE Quelle kennt', () => {
    const merged = mergeUserCounters([
      { [COUNTER_LIKES_GIVEN]: 3 },
      { [COUNTER_FLAGS_RAISED]: 1 },
    ])

    expect(merged).toEqual({ [COUNTER_LIKES_GIVEN]: 3, [COUNTER_FLAGS_RAISED]: 1 })
  })

  it('verwirft Unsinn statt ihn zu addieren', () => {
    // Eine kaputte Quelle darf eine Zählung nicht ins Absurde ziehen — und
    // eine negative Zahl darf sie schon gar nicht VERKLEINERN.
    const merged = mergeUserCounters([
      { [COUNTER_LIKES_GIVEN]: 5 },
      { [COUNTER_LIKES_GIVEN]: Number.NaN },
      { [COUNTER_LIKES_GIVEN]: -3 },
      { [COUNTER_LIKES_GIVEN]: Number.POSITIVE_INFINITY },
    ])

    expect(merged[COUNTER_LIKES_GIVEN]).toBe(5)
  })

  it('ohne Quellen: leere Zählung, kein Fehler', () => {
    expect(mergeUserCounters([])).toEqual({})
  })
})

describe('collectUserCounters', () => {
  it('fragt alle Quellen und reicht die Schwellen durch', async () => {
    const seen: number[][] = []
    registerUserCounterProvider('a', (_event, q) => {
      seen.push([...q.thresholds])
      return { [counterLikedItems(1)]: 2 }
    })
    registerUserCounterProvider('b', (_event, q) => {
      seen.push([...q.thresholds])
      return { [counterLikedItems(1)]: 3 }
    })

    const counters = await collectUserCounters(event, query)

    expect(registeredUserCounterProviders()).toEqual(['a', 'b'])
    expect(seen).toEqual([[1, 5], [1, 5]])
    expect(counters[counterLikedItems(1)]).toBe(5)
  })

  it('reicht das Zeitfenster durch — und lässt es weg, wenn keines gefragt ist', async () => {
    // F1 „Jahrestag": `since` ist optional, und genau darin liegt seine
    // Sparsamkeit. Eine Quelle, die es SIEHT, stellt eine zusätzliche Abfrage;
    // eine Quelle, die es nicht sieht, bleibt so teuer wie vorher. Käme es als
    // leerer String statt als `undefined` an, würde jede Quelle die Abfrage
    // stellen und dabei nichts messen.
    const seen: Array<string | undefined> = []
    registerUserCounterProvider('a', (_event, q) => {
      seen.push(q.since)
      return {}
    })

    await collectUserCounters(event, query)
    await collectUserCounters(event, { ...query, since: '2025-08-04T00:00:00.000Z' })

    expect(seen).toEqual([undefined, '2025-08-04T00:00:00.000Z'])
  })

  it('eine kaputte Quelle kostet ihren Beitrag — nicht die Zählung', async () => {
    // Der Unterschied zum Schreib-Wächter, der bei Störung wirft: hier ist
    // eine ausgefallene Quelle nur ein UNTERzählen, und weil ein Abzeichen nie
    // eingezogen wird, holt die nächste Auswertung es nach.
    registerUserCounterProvider('kaputt', () => { throw new Error('weg') })
    registerUserCounterProvider('heil', () => ({ [COUNTER_LIKES_GIVEN]: 9 }))

    const counters = await collectUserCounters(event, query)

    expect(counters[COUNTER_LIKES_GIVEN]).toBe(9)
    expect(logEvent).toHaveBeenCalledWith('warn', 'user_counters.provider_failed', expect.objectContaining({ provider: 'kaputt' }))
  })

  it('ohne angemeldeten Nutzer wird KEINE Quelle gefragt', async () => {
    // Der Vertrag zählt immer den Handelnden. Ein Gast hat nichts getan, und
    // eine Quelle, die trotzdem liefe, müsste raten, wen sie zählen soll.
    const provider = vi.fn(() => ({ [COUNTER_LIKES_GIVEN]: 1 }))
    registerUserCounterProvider('a', provider)

    const counters = await collectUserCounters({ context: {} } as unknown as H3Event, query)

    expect(provider).not.toHaveBeenCalled()
    expect(counters).toEqual({})
  })

  it('ohne Quellen: leere Zählung', async () => {
    expect(await collectUserCounters(event, query)).toEqual({})
  })
})
