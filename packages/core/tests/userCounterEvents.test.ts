import { describe, expect, it } from 'vitest'
import {
  USER_COUNTER_KINDS,
  mergeUserCounterEvents,
  type UserCounterEvent,
} from '../server/utils/userCounterEvents'
import { COUNTER_REPLIES_CREATED, COUNTER_TOPICS_CREATED } from '../server/utils/userCounters'

/**
 * Der Vertrag der mitschreibenden Zähler (F1) — die pure Hälfte.
 *
 * Die Registry selbst braucht keinen Test: sie setzt eine Variable. Was einen
 * braucht, ist die Zusammenfassung, denn sie entscheidet, wie viele
 * Datenbank-Schritte eine Buchung kostet und ob eine kaputte Meldung die
 * gesunden mitnimmt.
 */
function ev(userId: string, kind: UserCounterEvent['kind'], delta: number): UserCounterEvent {
  return { userId, kind, delta }
}

describe('mergeUserCounterEvents', () => {
  it('fasst dieselbe Art beim selben Menschen zusammen', () => {
    // Der reale Fall: wer seinen EIGENEN Beitrag hochstimmt, ist Geber und
    // Empfänger — zwei Meldungen, eine Zeile, zwei verschiedene Arten.
    expect(mergeUserCounterEvents([
      ev('u1', 'upvotesGiven', 1),
      ev('u1', 'upvotesGiven', 1),
    ])).toEqual([ev('u1', 'upvotesGiven', 2)])
  })

  it('hält verschiedene Menschen und Arten auseinander', () => {
    const merged = mergeUserCounterEvents([
      ev('u1', 'upvotesGiven', 1),
      ev('u2', 'upvotesReceived', 1),
    ])
    expect(merged).toHaveLength(2)
    expect(merged).toContainEqual(ev('u1', 'upvotesGiven', 1))
    expect(merged).toContainEqual(ev('u2', 'upvotesReceived', 1))
  })

  it('wirft eine Summe von null weg', () => {
    // Hoch und gleich wieder runter ist kein Datenbank-Schritt wert.
    expect(mergeUserCounterEvents([
      ev('u1', 'edits', 1),
      ev('u1', 'edits', -1),
    ])).toEqual([])
  })

  it('verwirft Unbrauchbares, ohne den Rest mitzunehmen', () => {
    const merged = mergeUserCounterEvents([
      ev('', 'edits', 1),
      ev('u1', 'unbekannt' as UserCounterEvent['kind'], 1),
      ev('u1', 'edits', Number.NaN),
      ev('u1', 'edits', 1.5),
      ev('u1', 'edits', 1),
    ])
    expect(merged).toEqual([ev('u1', 'edits', 1)])
  })
})

describe('die Zähler-Namen des Seeds', () => {
  it('heißen genauso wie ihre Ereignis-Art', () => {
    // Der Lazy-Seed setzt die Antwort der Aggregat-Quellen OHNE
    // Übersetzungstabelle in die Zähler-Zeile. Das geht nur, solange beide
    // Listen dieselben Wörter benutzen — hier steht die Absicht als Prüfung.
    expect(USER_COUNTER_KINDS).toContain(COUNTER_TOPICS_CREATED)
    expect(USER_COUNTER_KINDS).toContain(COUNTER_REPLIES_CREATED)
  })
})
