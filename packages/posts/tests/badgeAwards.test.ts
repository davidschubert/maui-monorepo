import { describe, expect, it } from 'vitest'
import { CONTENT_UPVOTE_KINDS } from '../../core/server/utils/contentUpvotes'
import {
  BADGE_AWARD_MODES,
  BADGE_CATALOG,
  BADGE_QUALIFIER_NONE,
  badgeContentWindowDays,
  badgeDefinition,
  badgeFollowsFromCounters,
  completedMembershipYears,
  contentBadgeCrossings,
  contentBadgeKeysFor,
  contentBadgeTrigger,
  counterBadgeCrossings,
  counterBadgeKeysFor,
  membershipYearOf,
  membershipYearQualifier,
  membershipYearWindow,
} from '../shared/badges'

/**
 * MEHRFACH-VERLEIHUNG (F1 Teilpaket 2, Davids Entscheidung vom 2026-08-04).
 *
 * Geprüft wird die REGEL, nicht die Datenbank: welches Abzeichen wie oft kommen
 * darf, woran sich zwei Verleihungen unterscheiden, und dass keine davon
 * doppelt entsteht.
 */

describe('die Zuordnung am Katalog', () => {
  it('gibt jedem Abzeichen genau eine Verleihungs-Art', () => {
    for (const badge of BADGE_CATALOG) {
      expect(BADGE_AWARD_MODES, badge.key).toContain(badge.awardedPer)
    }
  })

  it('verteilt sie so, wie Davids Regel es sagt', () => {
    // Der Wächter über die ENTSCHEIDUNG: „sinnvoll zählbar" heißt neues
    // qualifizierendes Ereignis — je Inhalt über der Schwelle, je Mitgliedsjahr.
    // Alles andere ist ein erstes Mal oder ein Bestand und bleibt einmalig.
    const byMode = (mode: string) => BADGE_CATALOG.filter(b => b.awardedPer === mode).map(b => b.key)

    expect(byMode('content')).toEqual([
      'nice-topic', 'good-topic', 'great-topic',
      'nice-reply', 'good-reply', 'great-reply',
    ])
    expect(byMode('membershipYear')).toEqual(['anniversary'])
    expect(byMode('once')).toEqual([
      'profile', 'first-like', 'first-flag', 'editor',
      'welcome', 'appreciated', 'thank-you', 'gives-back', 'empathetic', 'respected', 'admired',
    ])
  })

  it('nennt für jedes Inhalts-Abzeichen Form und Schwelle — und für kein anderes', () => {
    // Die Gegenprobe ist die wichtige: ein Abzeichen mit `content`, dessen
    // Bedingung nicht an EINEM Stück hängt, würde beim Stimmen nie verliehen.
    for (const badge of BADGE_CATALOG) {
      const trigger = contentBadgeTrigger(badge)
      if (badge.awardedPer === 'content') expect(trigger, badge.key).not.toBeNull()
      else expect(trigger, badge.key).toBeNull()
    }
  })

  it('benutzt dieselben Inhalts-Formen wie der Core-Vertrag', () => {
    // `shared/` darf den Server-Vertrag nicht importieren (es läuft im
    // Browser). Damit aus der Absicht kein Zufall wird, hängen die Listen hier
    // aneinander: eine dritte Form im Vertrag ohne Gegenstück wäre eine
    // Meldung, die nie ein Abzeichen ergibt.
    const used = new Set(BADGE_CATALOG.map(contentBadgeTrigger).filter(Boolean).map(t => t!.kind))
    expect([...used].sort()).toEqual([...CONTENT_UPVOTE_KINDS].sort())
  })
})

describe('Posting-Abzeichen: das Merkmal ist der Inhalt', () => {
  it('verdient bei einem Stand ALLES, was darunter liegt', () => {
    expect(contentBadgeKeysFor('topic', 9)).toEqual([])
    expect(contentBadgeKeysFor('topic', 10)).toEqual(['nice-topic'])
    expect(contentBadgeKeysFor('topic', 30)).toEqual(['nice-topic', 'good-topic'])
    expect(contentBadgeKeysFor('topic', 50)).toEqual(['nice-topic', 'good-topic', 'great-topic'])
  })

  it('trennt Beiträge und Antworten', () => {
    // Sonst bekäme eine gefeierte Antwort das Beitrags-Abzeichen — und der
    // Katalog sagt an beiden Stellen etwas anderes.
    expect(contentBadgeKeysFor('reply', 25)).toEqual(['nice-reply', 'good-reply'])
    expect(contentBadgeKeysFor('reply', 25).some(key => key.endsWith('-topic'))).toBe(false)
  })

  it('verleiht nur das NEUE — die Differenz zwischen vorher und nachher', () => {
    // Ohne sie liefe jede weitere Stimme auf einem beliebten Beitrag in bis zu
    // drei Schreibversuche, die alle im Unique-Index enden.
    expect(contentBadgeCrossings('topic', 9, 10)).toEqual(['nice-topic'])
    expect(contentBadgeCrossings('topic', 10, 11)).toEqual([])
    expect(contentBadgeCrossings('topic', 60, 61)).toEqual([])
  })

  it('verliert nichts, wenn die Zählung springt', () => {
    // Zwei gleichzeitige Stimmen: die Neuzählung kann von 9 auf 11 gehen. Ein
    // `=== Schwelle` hätte die 10 lautlos verloren.
    expect(contentBadgeCrossings('topic', 9, 11)).toEqual(['nice-topic'])
    expect(contentBadgeCrossings('reply', 0, 50)).toEqual(['nice-reply', 'good-reply', 'great-reply'])
  })

  it('rechnet ohne bekannten Vorstand vom Nullpunkt aus', () => {
    // `previousUpvotes` ist optional; fehlt es, verhält sich die Meldung wie
    // vor der Optimierung — idempotent, nur teurer.
    expect(contentBadgeCrossings('topic', 0, 25)).toEqual(['nice-topic', 'good-topic'])
  })
})

describe('Zähler-Abzeichen: was die Buchung allein entscheiden darf', () => {
  it('erkennt genau die Bedingungen, die aus Zählern folgen', () => {
    for (const badge of BADGE_CATALOG) {
      const expected = badge.key === 'first-like' || badge.key === 'editor'
      expect(badgeFollowsFromCounters(badge), badge.key).toBe(expected)
    }
  })

  it('lässt gemischte Bedingungen ausdrücklich NICHT durch', () => {
    // „Dankeschön" verlangt vergebene UND erhaltene Stimmen. Die Buchung kennt
    // die zweite Hälfte nicht — sie hier zu verleihen wäre geraten.
    expect(badgeFollowsFromCounters(badgeDefinition('thank-you')!)).toBe(false)
  })

  it('verleiht beim Stand, den die Zähler zeigen', () => {
    expect(counterBadgeKeysFor({ likesGiven: 0, edits: 0 })).toEqual([])
    expect(counterBadgeKeysFor({ likesGiven: 1, edits: 0 })).toEqual(['first-like'])
    expect(counterBadgeKeysFor({ likesGiven: 3, edits: 2 })).toEqual(['first-like', 'editor'])
  })

  it('verleiht nur beim ÜBERSCHREITEN, nicht bei jedem Stand darüber', () => {
    expect(counterBadgeCrossings({ likesGiven: 0, edits: 0 }, { likesGiven: 1, edits: 0 })).toEqual(['first-like'])
    expect(counterBadgeCrossings({ likesGiven: 1, edits: 0 }, { likesGiven: 2, edits: 0 })).toEqual([])
    expect(counterBadgeCrossings({ likesGiven: 5, edits: 0 }, { likesGiven: 5, edits: 1 })).toEqual(['editor'])
  })
})

describe('der Jahrestag kommt jährlich', () => {
  const yearDays = badgeContentWindowDays()!

  it('zählt jedes vollendete Mitgliedsjahr', () => {
    expect(completedMembershipYears(364, yearDays)).toEqual([])
    expect(completedMembershipYears(365, yearDays)).toEqual([1])
    expect(completedMembershipYears(1094, yearDays)).toEqual([1, 2])
    expect(completedMembershipYears(1095, yearDays)).toEqual([1, 2, 3])
  })

  it('macht aus UNBEKANNT kein Jahr', () => {
    // Dieselbe Regel wie in `badgeEarned`: ohne Naht zum Control Plane bleibt
    // der Jahrestag unverdient statt falsch verliehen.
    expect(completedMembershipYears(null, yearDays)).toEqual([])
  })

  it('schneidet jedes Jahr vorne UND hinten ab', () => {
    // Der Kern der Mehrjahres-Regel: Jahr 1 endet, wo Jahr 2 anfängt. Mit einem
    // bloßen „seit" wäre Jahr 1 qualifiziert, sobald jemand heute schreibt.
    const first = membershipYearWindow('2023-08-04T00:00:00.000Z', 1, yearDays)!
    const second = membershipYearWindow('2023-08-04T00:00:00.000Z', 2, yearDays)!

    expect(first.since).toBe('2023-08-04T00:00:00.000Z')
    expect(first.until).toBe('2024-08-03T00:00:00.000Z')
    expect(second.since).toBe(first.until)
    expect(second.until > second.since).toBe(true)
  })

  it('gibt ohne brauchbares Beitrittsdatum kein Fenster', () => {
    expect(membershipYearWindow(null, 1, yearDays)).toBeNull()
    expect(membershipYearWindow('kein Datum', 1, yearDays)).toBeNull()
    expect(membershipYearWindow('2023-08-04T00:00:00.000Z', 0, yearDays)).toBeNull()
  })

  it('liest eine Bestandszeile als Jahr 1', () => {
    // Sonst käme der erste Jahrestag nach der Umstellung ein zweites Mal — die
    // alte Zeile trägt '' und wüsste sonst von keinem Jahr.
    expect(membershipYearOf(BADGE_QUALIFIER_NONE)).toBe(membershipYearQualifier(1))
    expect(membershipYearOf('3')).toBe('3')
  })
})
