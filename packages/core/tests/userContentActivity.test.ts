import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * F1 Stufe 3 — „wo war dieser Mensch zuletzt aktiv?".
 *
 * Wie contentActivity benutzt das Modul `logEvent` als Nuxt-AUTO-IMPORT; im
 * Test gibt es keinen, also wird es vorher auf `globalThis` gelegt. Gebraucht
 * wird es für den wichtigsten Fall: die kaputte Quelle.
 */
const logEvent = vi.fn()
;(globalThis as unknown as { logEvent: unknown }).logEvent = logEvent

const {
  __resetUserActivityProviders,
  collectUserActivity,
  mergeUserActivity,
  registerUserActivityProvider,
  registeredUserActivityProviders,
} = await import('../server/utils/userContentActivity')

const event = {} as H3Event

beforeEach(() => {
  __resetUserActivityProviders()
  logEvent.mockClear()
})

describe('mergeUserActivity — die gemeinsame Zeitachse', () => {
  it('ordnet neueste zuerst, quer über die Quellen', () => {
    // DAS ist der Grund für den ganzen Vertrag: ein Kommentar von heute muss
    // vor einem eigenen Beitrag von gestern stehen, obwohl die Zeitstempel aus
    // verschiedenen Layern kommen.
    const merged = mergeUserActivity([
      { targetType: 'post', targetId: 'alt', at: '2026-08-01T10:00:00.000Z' },
      { targetType: 'post', targetId: 'neu', at: '2026-08-04T10:00:00.000Z' },
      { targetType: 'post', targetId: 'mittel', at: '2026-08-02T10:00:00.000Z' },
    ], 10)

    expect(merged.map(entry => entry.targetId)).toEqual(['neu', 'mittel', 'alt'])
  })

  it('behält je Ziel nur die JÜNGSTE Berührung', () => {
    // Wer zehnmal unter demselben Beitrag geschrieben hat, war dort EINMAL
    // zuletzt aktiv.
    const merged = mergeUserActivity([
      { targetType: 'post', targetId: 'p1', at: '2026-08-01T10:00:00.000Z' },
      { targetType: 'post', targetId: 'p1', at: '2026-08-03T10:00:00.000Z' },
      { targetType: 'post', targetId: 'p1', at: '2026-08-02T10:00:00.000Z' },
    ], 10)

    expect(merged).toEqual([{ targetType: 'post', targetId: 'p1', at: '2026-08-03T10:00:00.000Z' }])
  })

  it('trennt gleiche Ids verschiedener TYPEN', () => {
    const merged = mergeUserActivity([
      { targetType: 'post', targetId: 'x', at: '2026-08-01T10:00:00.000Z' },
      { targetType: 'ticket', targetId: 'x', at: '2026-08-02T10:00:00.000Z' },
    ], 10)

    expect(merged).toHaveLength(2)
  })

  it('klemmt auf das Limit — und verträgt 0', () => {
    const entries = ['a', 'b', 'c'].map((id, i) => ({
      targetType: 'post', targetId: id, at: `2026-08-0${i + 1}T10:00:00.000Z`,
    }))
    expect(mergeUserActivity(entries, 2)).toHaveLength(2)
    expect(mergeUserActivity(entries, 0)).toEqual([])
    expect(mergeUserActivity(entries, -1)).toEqual([])
  })

  it('GEGENPROBE: unvollständige Einträge fallen heraus, statt die Achse zu verderben', () => {
    const merged = mergeUserActivity([
      { targetType: '', targetId: 'x', at: '2026-08-01T10:00:00.000Z' },
      { targetType: 'post', targetId: '', at: '2026-08-01T10:00:00.000Z' },
      { targetType: 'post', targetId: 'y', at: '' },
    ], 10)

    expect(merged).toEqual([])
  })
})

describe('collectUserActivity — mehrere Quellen', () => {
  it('fragt ALLE angemeldeten Quellen und führt sie zusammen', () => {
    // Der Unterschied zu contentActivity/contentWriteGuard: dort wird an EINEN
    // Besitzer weitergereicht, hier wird ausgefächert.
    registerUserActivityProvider('comments', () => [
      { targetType: 'post', targetId: 'p-kommentiert', at: '2026-08-04T10:00:00.000Z' },
    ])
    registerUserActivityProvider('events', () => [
      { targetType: 'event', targetId: 'e-1', at: '2026-08-03T10:00:00.000Z' },
    ])

    expect(registeredUserActivityProviders().sort()).toEqual(['comments', 'events'])
    return expect(collectUserActivity(event, 'user-1', 5)).resolves.toEqual([
      { targetType: 'post', targetId: 'p-kommentiert', at: '2026-08-04T10:00:00.000Z' },
      { targetType: 'event', targetId: 'e-1', at: '2026-08-03T10:00:00.000Z' },
    ])
  })

  it('reicht Nutzer und Obergrenze durch', async () => {
    const provider = vi.fn(() => [])
    registerUserActivityProvider('comments', provider)

    await collectUserActivity(event, 'user-1', 20)

    expect(provider).toHaveBeenCalledWith(event, { userId: 'user-1', limit: 20 })
  })

  it('EINE KAPUTTE QUELLE KOSTET NICHT DIE SEITENLEISTE — die übrigen gelten weiter', async () => {
    // Anders als beim Schreib-Wächter: dort ist die Antwort die BEDINGUNG eines
    // Schreibvorgangs, hier ist sie Komfort.
    registerUserActivityProvider('kaputt', () => {
      throw new Error('Appwrite ist gerade nicht erreichbar')
    })
    registerUserActivityProvider('heil', () => [
      { targetType: 'post', targetId: 'p1', at: '2026-08-04T10:00:00.000Z' },
    ])

    const result = await collectUserActivity(event, 'user-1', 5)

    expect(result.map(entry => entry.targetId)).toEqual(['p1'])
    expect(logEvent).toHaveBeenCalledWith('warn', 'user_activity.provider_failed', expect.objectContaining({
      provider: 'kaputt',
    }))
  })

  it('GEGENPROBE: ohne Quellen, ohne Nutzer oder ohne Limit passiert nichts', async () => {
    await expect(collectUserActivity(event, 'user-1', 5)).resolves.toEqual([])

    registerUserActivityProvider('comments', () => [
      { targetType: 'post', targetId: 'p1', at: '2026-08-04T10:00:00.000Z' },
    ])
    await expect(collectUserActivity(event, '', 5)).resolves.toEqual([])
    await expect(collectUserActivity(event, 'user-1', 0)).resolves.toEqual([])
  })
})
