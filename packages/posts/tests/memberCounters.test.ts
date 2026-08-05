import { describe, expect, it } from 'vitest'
import {
  MEMBER_COUNTER_COLUMNS,
  counterFellBehind,
  emptyMemberCounterValues,
  healedValues,
  memberCounterValues,
  seedValuesFrom,
} from '../shared/memberCounters'

/**
 * Die Rechenregeln der mitschreibenden Zähler (F1, gemeinsames Paket).
 *
 * Geprüft wird das, was still schiefgehen kann: ein Startwert, der einem
 * langjährigen Mitglied seinen Bestand nimmt, und eine Selbstheilung, die die
 * eine Sache platt macht, die sie nicht nachrechnen kann.
 */
function stored(overrides: Partial<ReturnType<typeof emptyMemberCounterValues>> = {}) {
  return { ...emptyMemberCounterValues(), ...overrides }
}

describe('seedValuesFrom', () => {
  it('übernimmt, was sich aus dem Bestand ausrechnen lässt', () => {
    expect(seedValuesFrom({ topicsCreated: 12, repliesCreated: 340, upvotesGiven: 88 })).toEqual({
      topicsCreated: 12,
      repliesCreated: 340,
      upvotesGiven: 88,
      upvotesReceived: 0,
      edits: 0,
    })
  })

  it('startet erhaltene Stimmen und Bearbeitungen bei null', () => {
    // KEIN Versehen, sondern die Wahrheit: eine Bearbeitung hinterlässt einen
    // Zeitstempel und keine Anzahl, und die Summe erhaltener Stimmen ließe
    // sich nur durch Laden aller eigenen Inhalte bilden. Beide zählen ab der
    // Umstellung — der Satz steht im Kopf von shared/memberCounters.ts und
    // hier als Prüfung, damit ihn niemand später „repariert".
    const seed = seedValuesFrom({ topicsCreated: 1, repliesCreated: 1, upvotesGiven: 1 })
    expect(seed.upvotesReceived).toBe(0)
    expect(seed.edits).toBe(0)
  })

  it('macht aus fehlenden und kaputten Zahlen eine Null', () => {
    expect(seedValuesFrom({})).toEqual(emptyMemberCounterValues())
    expect(seedValuesFrom({ topicsCreated: -3, repliesCreated: Number.NaN, upvotesGiven: 2.7 })).toEqual({
      ...emptyMemberCounterValues(),
      upvotesGiven: 2,
    })
  })
})

describe('counterFellBehind', () => {
  it('erkennt einen verlorenen Schreibvorgang', () => {
    // Der reale Fall: eine Meldung ging fail-soft unter (Deploy mitten im
    // Vorgang). Ohne Nachziehen bliebe ein verdientes Abzeichen für immer weg.
    expect(counterFellBehind(stored({ upvotesGiven: 9 }), { upvotesGiven: 10 })).toBe(true)
  })

  it('ist zufrieden, wenn der Zähler vorne liegt', () => {
    expect(counterFellBehind(stored({ upvotesGiven: 11 }), { upvotesGiven: 10 })).toBe(false)
  })

  it('sieht in einer Antwort ohne Seed-Zahlen keinen Rückstand', () => {
    // Der Normalfall: eine geeichte Zeile fragt die teuren Seed-Abfragen gar
    // nicht mehr ab, die Zahlen fehlen also. Das darf nicht als „Rückstand"
    // gelesen werden — sonst schriebe jeder Aufruf die Zähler auf null.
    expect(counterFellBehind(stored({ topicsCreated: 5, repliesCreated: 7, upvotesGiven: 9 }), {})).toBe(false)
  })
})

describe('healedValues', () => {
  it('hebt die eichbaren Spalten und lässt die anderen stehen', () => {
    const healed = healedValues(
      stored({ topicsCreated: 1, repliesCreated: 2, upvotesGiven: 3, upvotesReceived: 40, edits: 5 }),
      { topicsCreated: 9, repliesCreated: 1, upvotesGiven: 3 },
    )
    expect(healed.topicsCreated).toBe(9)
    // Ein NIEDRIGERES Aggregat zieht nicht nach unten — eine gelöschte Antwort
    // nimmt niemandem das Geschriebene weg.
    expect(healed.repliesCreated).toBe(2)
    expect(healed.upvotesGiven).toBe(3)
    // Die beiden ohne Aggregat bleiben unangetastet; ein Überschreiben machte
    // bei jedem Aufruf das Abzeichen „Editor" wieder kaputt.
    expect(healed.upvotesReceived).toBe(40)
    expect(healed.edits).toBe(5)
  })
})

describe('memberCounterValues', () => {
  it('liest eine Zeile defensiv', () => {
    expect(memberCounterValues(null)).toEqual(emptyMemberCounterValues())
    expect(memberCounterValues({ topicsCreated: 3, edits: null })).toEqual({
      ...emptyMemberCounterValues(),
      topicsCreated: 3,
    })
  })

  it('kennt genau die Spalten, die die Migration anlegt', () => {
    expect([...MEMBER_COUNTER_COLUMNS]).toEqual([
      'topicsCreated', 'repliesCreated', 'upvotesGiven', 'upvotesReceived', 'edits',
    ])
  })
})
