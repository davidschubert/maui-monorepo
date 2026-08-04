import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * F1 Stufe 2 — der Aktivitäts-Vertrag.
 *
 * `contentActivity.ts` benutzt `logEvent` als Nuxt-AUTO-IMPORT (kein `import`
 * im Modul). Im Test gibt es keinen Auto-Import, also wird die Funktion vorher
 * auf `globalThis` gelegt — dasselbe Verfahren wie in den anderen
 * server/utils-Tests dieses Pakets. Sie wird gebraucht: der wichtigste Fall
 * unten ist der WERFENDE Handler, und der landet genau dort.
 */
const logEvent = vi.fn()
;(globalThis as unknown as { logEvent: unknown }).logEvent = logEvent

const {
  __resetContentActivityHandlers,
  notifyContentActivity,
  registerContentActivityHandler,
  registeredContentActivityTypes,
} = await import('../server/utils/contentActivity')

/** Der Vertrag reicht das Event nur durch — ein Platzhalter genügt. */
const event = {} as H3Event

beforeEach(() => {
  __resetContentActivityHandlers()
  logEvent.mockClear()
})

describe('registerContentActivityHandler', () => {
  it('meldet den Typ an und ruft ihn mit Typ, Id und Zeitpunkt', async () => {
    const handler = vi.fn()
    registerContentActivityHandler('post', handler)

    expect(registeredContentActivityTypes()).toEqual(['post'])
    await notifyContentActivity(event, 'post', 'row-1', '2026-08-04T10:00:00.000Z')

    expect(handler).toHaveBeenCalledWith(event, {
      targetType: 'post',
      targetId: 'row-1',
      at: '2026-08-04T10:00:00.000Z',
    })
  })

  it('ist je Typ EINE Autorität — die letzte Registrierung gewinnt', () => {
    const first = vi.fn()
    const second = vi.fn()
    registerContentActivityHandler('post', first)
    registerContentActivityHandler('post', second)

    expect(registeredContentActivityTypes()).toEqual(['post'])
  })

  it('trennt Typen sauber — ein Kommentar am Ticket rührt den Beitrags-Handler nicht an', async () => {
    const posts = vi.fn()
    registerContentActivityHandler('post', posts)

    await notifyContentActivity(event, 'ticket', 'row-1')

    expect(posts).not.toHaveBeenCalled()
  })
})

describe('notifyContentActivity', () => {
  it('GEGENPROBE: ohne registrierten Typ passiert nichts — und es ist KEIN Fehler', async () => {
    // Das ist der Unterschied zu registerReportTarget (dort: 400). Ein
    // Kommentar an einem Ziel ohne Aktivitäts-Spalte ist völlig in Ordnung;
    // eine Ausnahme hier legte jede App ohne posts-Layer beim Kommentieren lahm.
    await expect(notifyContentActivity(event, 'ticket', 'row-1')).resolves.toBeUndefined()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it('GEGENPROBE: ein werfender Handler bricht den Aufrufer NICHT ab', async () => {
    // Der Satz, auf dem der ganze Vertrag ruht: niemandes Kommentar darf
    // verloren gehen, weil ein Zeitstempel nicht nachgezogen werden konnte.
    registerContentActivityHandler('post', () => {
      throw new Error('Appwrite ist gerade nicht erreichbar')
    })

    await expect(notifyContentActivity(event, 'post', 'row-1')).resolves.toBeUndefined()
  })

  it('ein werfender Handler wird aber PROTOKOLLIERT (kein stiller Dauerausfall)', async () => {
    registerContentActivityHandler('post', () => {
      throw new Error('kaputt')
    })

    await notifyContentActivity(event, 'post', 'row-1')

    expect(logEvent).toHaveBeenCalledWith('warn', 'content.activity_failed', expect.objectContaining({
      targetType: 'post',
      targetId: 'row-1',
      message: 'kaputt',
    }))
  })

  it('GEGENPROBE: leerer Typ oder leere Id lösen nichts aus', async () => {
    const handler = vi.fn()
    registerContentActivityHandler('post', handler)

    await notifyContentActivity(event, '', 'row-1')
    await notifyContentActivity(event, 'post', '')

    expect(handler).not.toHaveBeenCalled()
  })

  it('ohne eigenen Zeitpunkt nimmt der Vertrag „jetzt"', async () => {
    const handler = vi.fn()
    registerContentActivityHandler('post', handler)

    const before = Date.now()
    await notifyContentActivity(event, 'post', 'row-1')
    const at = Date.parse(handler.mock.calls[0]![1].at)

    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBeLessThanOrEqual(Date.now())
  })
})
