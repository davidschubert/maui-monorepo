import { describe, expect, it } from 'vitest'
import {
  canHideEvent,
  canRedactEvent,
  canRestoreEvent,
  eventIsEditable,
  eventIsPubliclyVisible,
  eventIsRedacted,
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

/**
 * F46 — SCHWÄRZEN: die Lücke, die F15 bewusst offen ließ.
 *
 * Ein abgesagter Termin wird nicht ausgeblendet (die Zusagenden haben ein
 * Anrecht auf die Absage). Ist der TEXT das Problem, wird er entfernt: Titel
 * und Beschreibung leer, Titelbild weg, Status bleibt `cancelled`.
 */
describe('Schwärzen: nur was abgesagt IST', () => {
  it('erlaubt es genau für abgesagte Termine', () => {
    expect(verdicts(canRedactEvent)).toEqual({
      draft: false, published: false, cancelled: true, hidden: false,
    })
  })

  it('nennt einen EIGENEN Grund — für die anderen Zustände gibt es ein anderes Werkzeug', () => {
    // `not_cancelled` heißt nicht „daran ist nichts zu sehen" (das wäre
    // `not_visible`), sondern „nimm das andere Werkzeug": bei `published` das
    // Ausblenden. Ein gemeinsamer Grund zwänge die Oberfläche, aus dem Status
    // zurückzurechnen, welchen Satz sie zeigt.
    expect(canRedactEvent('published').reason).toBe('not_cancelled')
    expect(canRedactEvent('draft').reason).toBe('not_cancelled')
    expect(canRedactEvent('hidden').reason).toBe('not_cancelled')
    expect(canRedactEvent('cancelled').reason).toBeNull()
  })

  it('bleibt bei `hidden` und `draft` aus, weil es dort nichts zu gewinnen gäbe', () => {
    // Beide tragen kein Leserecht — den Text sieht ohnehin niemand außer der
    // Moderation. Schwärzen wäre dort kein Schutz, sondern nur ein zweiter,
    // unumkehrbarer Eingriff in etwas bereits Unsichtbares.
    expect(eventIsPubliclyVisible('hidden')).toBe(false)
    expect(eventIsPubliclyVisible('draft')).toBe(false)
    expect(canRedactEvent('hidden').allowed).toBe(false)
    expect(canRedactEvent('draft').allowed).toBe(false)
  })
})

describe('Je Zustand genau EIN Werkzeug', () => {
  it('kein Status erlaubt zwei Moderations-Aktionen gleichzeitig', () => {
    // Das Aktions-Menü der Queue verlässt sich darauf: es prüft der Reihe nach
    // und gibt die ERSTE zutreffende Aktion zurück. Überschnitten sich zwei,
    // verschwände eine davon lautlos aus der Oberfläche.
    for (const status of EVENT_STATUSES) {
      const allowed = [
        canHideEvent(status).allowed,
        canRestoreEvent(status).allowed,
        canRedactEvent(status).allowed,
      ].filter(Boolean)
      expect(allowed.length, status).toBeLessThanOrEqual(1)
    }
  })

  it('nur `draft` hat gar keine — und der steht nicht in der Queue', () => {
    const without = EVENT_STATUSES.filter(status =>
      !canHideEvent(status).allowed && !canRestoreEvent(status).allowed && !canRedactEvent(status).allowed)
    expect(without).toEqual(['draft'])
  })
})

describe('Der Marker trennt „leer" von „entfernt"', () => {
  it('erkennt eine gesetzte Zeitangabe als geschwärzt', () => {
    expect(eventIsRedacted('2026-08-03T10:00:00.000Z')).toBe(true)
  })

  it('liest Bestandszeilen ohne Spalte als NICHT geschwärzt', () => {
    // Vor Migration events-011 gibt es das Feld nicht; fail-open ist hier
    // richtig — eine Zeile ohne Marker hat ihren Text noch.
    expect(eventIsRedacted(null)).toBe(false)
    expect(eventIsRedacted(undefined)).toBe(false)
  })

  it('deutet den leeren String NICHT als Schwärzung', () => {
    // Appwrite liefert für nie gesetzte Datetime-Spalten null, aber ein leerer
    // String wäre eine Zeitangabe, die keine ist — und würde jedem Termin den
    // Hinweis „Inhalt entfernt" verpassen.
    expect(eventIsRedacted('')).toBe(false)
  })
})
