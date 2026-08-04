import { describe, expect, it } from 'vitest'
import {
  canHideEvent,
  canRestoreEvent,
  eventIsEditable,
  eventIsPubliclyVisible,
} from '../shared/eventModerationPolicy'
import { EVENT_STATUSES, type EventStatus } from '../shared/types/event'

/**
 * F15 — die Zustands-Regeln der Termin-Moderation.
 *
 * Diese Suite hält die ENTSCHEIDUNGEN fest, nicht die Implementierung. Jeder
 * Test deckt die GANZE Status-Menge ab (`EVENT_STATUSES`), damit ein künftiger
 * fünfter Status hier bricht statt still durch eine Ternär-Kette zu fallen —
 * genau so ist `hidden` selbst in der Dashboard-Liste beinahe untergegangen.
 */

const verdicts = (fn: (status: EventStatus) => { allowed: boolean }) =>
  Object.fromEntries(EVENT_STATUSES.map(status => [status, fn(status).allowed]))

describe('Ausblenden: nur was auch sichtbar ist', () => {
  it('erlaubt es genau für veröffentlichte Termine', () => {
    expect(verdicts(canHideEvent)).toEqual({
      draft: false, published: true, cancelled: false, hidden: false,
    })
  })

  it('nennt den Grund — ein Entwurf ist nicht sichtbar, eine Absage ist etwas anderes', () => {
    // Ein Entwurf trägt gar kein Leserecht: „ausblenden" wäre wirkungslos und
    // das spätere Wiederherstellen wäre eine Veröffentlichung, die niemand
    // angeordnet hat.
    expect(canHideEvent('draft').reason).toBe('not_visible')
    // Eine Absage ist die Nachricht, auf die die Zusagenden ein Anrecht haben.
    expect(canHideEvent('cancelled').reason).toBe('cancelled')
    expect(canHideEvent('published').reason).toBeNull()
  })

  it('ist nicht doppelt anwendbar (schon ausgeblendet ⇒ 409, keine zweite Runde)', () => {
    expect(canHideEvent('hidden')).toEqual({ allowed: false, reason: 'not_visible' })
  })
})

describe('Wiederherstellen: nur was ausgeblendet IST', () => {
  it('erlaubt es genau für ausgeblendete Termine', () => {
    expect(verdicts(canRestoreEvent)).toEqual({
      draft: false, published: false, cancelled: false, hidden: true,
    })
  })

  it('macht aus einem Entwurf keine Veröffentlichung', () => {
    // Die Restore-Route schreibt hart `published`. Ließe man `draft` durch,
    // veröffentlichte ein Moderator mit „Wieder anzeigen" einen unfertigen
    // Termin — deshalb ist die Sperre hier und nicht nur in der Route.
    expect(canRestoreEvent('draft')).toEqual({ allowed: false, reason: 'not_hidden' })
  })
})

describe('Bearbeiten: die Redaktion kommt an ein Moderations-Urteil nicht heran', () => {
  it('sperrt abgesagte UND ausgeblendete Termine', () => {
    expect(Object.fromEntries(EVENT_STATUSES.map(s => [s, eventIsEditable(s)]))).toEqual({
      draft: true, published: true, cancelled: false, hidden: false,
    })
  })

  it('ist die Grenze zwischen zwei Geschwister-Capabilities', () => {
    // `events.manage` (Editor) darf einen ausgeblendeten Termin nicht anfassen —
    // sonst hebt ein Editor per „Status: veröffentlicht" ein Urteil auf, dessen
    // Capability (`events.moderate`) er nie besitzt.
    expect(eventIsEditable('hidden')).toBe(false)
  })
})

describe('Öffentlich sichtbar: die Status-Sicht für Routen mit Operator-Klinke', () => {
  it('zählt published und cancelled, sonst nichts', () => {
    expect(Object.fromEntries(EVENT_STATUSES.map(s => [s, eventIsPubliclyVisible(s)]))).toEqual({
      draft: false, published: true, cancelled: true, hidden: false,
    })
  })

  it('schließt das Loch, an dem die Bewertung vorbeilief', () => {
    // score.post.ts holt den Termin als OPERATOR und liest damit absichtlich an
    // den Row-Permissions vorbei. Vor F15 prüfte es nur `draft` — ein
    // ausgeblendeter Termin blieb bewertbar.
    expect(eventIsPubliclyVisible('hidden')).toBe(false)
  })
})

describe('Ausblenden und Wiederherstellen sind zueinander invers', () => {
  it('was ausgeblendet werden darf, ist danach wiederherstellbar — und umgekehrt', () => {
    const hideable = EVENT_STATUSES.filter(s => canHideEvent(s).allowed)
    const restorable = EVENT_STATUSES.filter(s => canRestoreEvent(s).allowed)
    expect(hideable).toEqual(['published'])
    expect(restorable).toEqual(['hidden'])
    // Kein Status erlaubt BEIDES — sonst böte das Menü zwei Knöpfe an.
    expect(hideable.filter(s => restorable.includes(s))).toEqual([])
  })
})
