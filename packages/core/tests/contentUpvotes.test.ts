import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * F1 Teilpaket 2 — „dieser Inhalt hat jetzt so viele Aufstimmen".
 *
 * Wie beim Zähl-Vertrag benutzt das Modul `logEvent` als Nuxt-AUTO-IMPORT; im
 * Test gibt es keinen, also liegt es vorher auf `globalThis`.
 */
const logEvent = vi.fn()
;(globalThis as unknown as { logEvent: unknown }).logEvent = logEvent

const {
  __resetContentUpvoteHandler,
  contentUpvoteReportable,
  registerContentUpvoteHandler,
  reportContentUpvotes,
} = await import('../server/utils/contentUpvotes')

const event = {} as H3Event

function report(overrides: Record<string, unknown> = {}) {
  return { authorId: 'u1', contentId: 'c1', kind: 'topic' as const, upvotes: 10, ...overrides }
}

beforeEach(() => {
  __resetContentUpvoteHandler()
  logEvent.mockClear()
})

describe('contentUpvoteReportable', () => {
  it('nimmt eine vollständige Meldung an', () => {
    expect(contentUpvoteReportable(report())).toBe(true)
  })

  it('verwirft, was keinen Empfänger hat', () => {
    // GAST-KOMMENTARE: sie tragen `authorId: ''`, und ohne Konto gibt es
    // niemanden, dem ein Abzeichen gehören könnte.
    expect(contentUpvoteReportable(report({ authorId: '' }))).toBe(false)
  })

  it('verwirft, was keinen Inhalt benennt', () => {
    // Ohne Id gäbe es kein Merkmal — die Verleihung fiele auf das leere Merkmal
    // zurück und wäre von einer einmaligen nicht mehr zu unterscheiden.
    expect(contentUpvoteReportable(report({ contentId: '' }))).toBe(false)
  })

  it('verwirft unbekannte Formen und unbrauchbare Zahlen', () => {
    expect(contentUpvoteReportable(report({ kind: 'wiki' as never }))).toBe(false)
    expect(contentUpvoteReportable(report({ upvotes: 0 }))).toBe(false)
    expect(contentUpvoteReportable(report({ upvotes: 1.5 }))).toBe(false)
    expect(contentUpvoteReportable(report({ upvotes: Number.NaN }))).toBe(false)
  })
})

describe('reportContentUpvotes', () => {
  it('reicht die Meldung an den angemeldeten Empfänger durch', async () => {
    const handler = vi.fn()
    registerContentUpvoteHandler(handler)

    await reportContentUpvotes(event, report({ previousUpvotes: 9 }))

    expect(handler).toHaveBeenCalledWith(event, expect.objectContaining({ contentId: 'c1', upvotes: 10, previousUpvotes: 9 }))
  })

  it('ohne Empfänger passiert nichts — kein Fehler', async () => {
    // Silo-App ohne Discussions, Playground: der Vertrag ist unbesetzt.
    await expect(reportContentUpvotes(event, report())).resolves.toBeUndefined()
  })

  it('ein werfender Empfänger kostet keine Stimme', async () => {
    // Die ganze Begründung des Vertrags: eine Verleihung ist Nebenwirkung des
    // Stimmens, nie seine Bedingung.
    registerContentUpvoteHandler(() => { throw new Error('weg') })

    await expect(reportContentUpvotes(event, report())).resolves.toBeUndefined()
    expect(logEvent).toHaveBeenCalledWith('warn', 'content_upvotes.report_failed', expect.objectContaining({ kind: 'topic' }))
  })
})
