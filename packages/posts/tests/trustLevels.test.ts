import { describe, expect, it } from 'vitest'
import { TRUST_LEVEL_CAPABILITIES, TRUST_LEVEL_LEADER } from '../../core/shared/trustLevel'
import { BADGE_CATALOG, trustLevelBadgeCrossings, trustLevelBadgeKeysFor } from '../shared/badges'
import {
  TRUST_LEVEL_CONDITIONS,
  TRUST_LEVEL_THRESHOLDS,
  earnedTrustLevel,
  effectiveTrustLevel,
  raisedTrustLevel,
  trustLevelProgress,
  trustLevelRequirement,
  type TrustLevelFacts,
} from '../shared/trustLevels'

/**
 * DIE SCHWELLEN-REGEL (F1 Teilpaket 3, Davids Zahlen „Mittel" vom 2026-08-04).
 *
 * Geprüft wird die REGEL, nicht die Datenbank: wer welche Stufe bekommt, dass
 * niemand absteigt, dass die Ernennung vorgeht und dass der Fortschritt ehrlich
 * rechnet.
 */

/** Ein Stand, der ALLES erfüllt — Ausgangspunkt für die Gegenproben. */
function facts(overrides: Partial<TrustLevelFacts> = {}): TrustLevelFacts {
  return {
    memberForDays: 10_000,
    contentCreated: 10_000,
    upvotesGiven: 10_000,
    upvotesReceived: 10_000,
    ...overrides,
  }
}

describe('Davids Zahlen stehen so im Code, wie er sie entschieden hat', () => {
  it('nennt die drei erarbeitbaren Stufen mit genau diesen Schwellen', () => {
    // Der Wächter über die ENTSCHEIDUNG selbst (DECISION-LOG 2026-08-04).
    // Ändert jemand eine Zahl, muss er hier vorbei — und dort steht, dass es
    // Davids ist.
    expect(TRUST_LEVEL_THRESHOLDS.map(entry => [entry.level, entry.requires])).toEqual([
      [1, { memberForDays: 2, contentCreated: 1, upvotesGiven: 1, upvotesReceived: 0 }],
      [2, { memberForDays: 15, contentCreated: 5, upvotesGiven: 10, upvotesReceived: 5 }],
      [3, { memberForDays: 60, contentCreated: 25, upvotesGiven: 50, upvotesReceived: 25 }],
    ])
  })

  it('kennt für Stufe 4 KEINE Schwelle', () => {
    // „Nur von Hand" ist eine Eigenschaft der Liste, aus der gerechnet wird —
    // nicht eine Notiz daneben. Stünde die 4 hier mit erfundenen Zahlen, könnte
    // sie sich jemand erarbeiten.
    expect(trustLevelRequirement(TRUST_LEVEL_LEADER)).toBeNull()
    expect(TRUST_LEVEL_THRESHOLDS.some(entry => entry.level === TRUST_LEVEL_LEADER)).toBe(false)
  })
})

describe('die erarbeitete Stufe', () => {
  it('ist 0, solange nichts erfüllt ist', () => {
    expect(earnedTrustLevel(facts({ memberForDays: 0, contentCreated: 0, upvotesGiven: 0, upvotesReceived: 0 }))).toBe(0)
  })

  it('gibt genau die Stufe, deren Schwellen alle erreicht sind', () => {
    // Exakt auf der Schwelle zählt als erfüllt (≥, nicht >).
    expect(earnedTrustLevel({ memberForDays: 2, contentCreated: 1, upvotesGiven: 1, upvotesReceived: 0 })).toBe(1)
    expect(earnedTrustLevel({ memberForDays: 15, contentCreated: 5, upvotesGiven: 10, upvotesReceived: 5 })).toBe(2)
    expect(earnedTrustLevel({ memberForDays: 60, contentCreated: 25, upvotesGiven: 50, upvotesReceived: 25 })).toBe(3)
  })

  it('bleibt eine Stufe darunter, wenn EINE Bedingung fehlt (UND, nie ODER)', () => {
    // Je Bedingung eine eigene Gegenprobe: ein ODER wäre hier grün.
    for (const condition of TRUST_LEVEL_CONDITIONS) {
      const target = TRUST_LEVEL_THRESHOLDS[2]!.requires[condition]
      if (target <= 0) continue
      expect(earnedTrustLevel(facts({ [condition]: target - 1 })), condition).toBeLessThan(3)
    }
  })

  it('steigt nicht über eine unerfüllte Stufe hinweg', () => {
    // Zeit und Zustimmung für 3, aber zu wenig geschrieben ⇒ auch die 2 ist
    // nicht erfüllt (sie verlangt 5 Inhalte), also bleibt es bei 1.
    expect(earnedTrustLevel(facts({ contentCreated: 3 }))).toBe(1)
  })

  it('zählt unbekannte Zugehörigkeit als NICHT erfüllt', () => {
    // Die Lehre vom Jahrestag: ohne Naht zum Control Plane ist die Dauer null.
    // Ginge sie als „lange genug" durch, bekäme ausgerechnet dort jeder sofort
    // Stufe 3, wo niemand nachsehen kann.
    expect(earnedTrustLevel(facts({ memberForDays: null }))).toBe(0)
  })

  it('erreicht nie die 4 — die gibt es nur von Hand', () => {
    expect(earnedTrustLevel(facts())).toBe(3)
  })
})

describe('kein Abstieg', () => {
  it('schreibt nur nach oben', () => {
    expect(raisedTrustLevel(1, 3)).toBe(3)
  })

  it('schreibt gar nicht, wenn sich nichts ändert', () => {
    // `null` heißt „kein Datenbank-Schritt" — das ist der Normalfall an jedem
    // Schreibvorgang, und deshalb muss es genau null sein und nicht die Stufe.
    expect(raisedTrustLevel(2, 2)).toBeNull()
  })

  it('senkt nie — auch nicht, wenn die Zähler zurückgehen', () => {
    // Eine zurückgenommene Stimme zählt herunter, und das Beitrittsdatum darf
    // fail-soft fehlen. Ohne diese Zeile verlöre jemand seine Rechte, weil
    // gerade eine Verbindung klemmt.
    expect(raisedTrustLevel(3, 0)).toBeNull()
    expect(raisedTrustLevel(3, 2)).toBeNull()
  })

  it('behandelt eine kaputte gespeicherte Zahl als Stufe 0', () => {
    expect(raisedTrustLevel(null, 1)).toBe(1)
    expect(raisedTrustLevel(Number.NaN, 1)).toBe(1)
    expect(raisedTrustLevel('3' as unknown, 1)).toBe(1)
  })
})

describe('die Ernennung geht vor', () => {
  it('macht aus jeder erarbeiteten Stufe die 4', () => {
    expect(effectiveTrustLevel(0, true)).toBe(4)
    expect(effectiveTrustLevel(3, true)).toBe(4)
  })

  it('legt die erarbeitete Stufe beim Entzug wieder frei', () => {
    // Genau dafür sind es zwei Spalten: der Entzug nimmt EINE Entscheidung
    // zurück und nicht die Arbeit von Jahren.
    expect(effectiveTrustLevel(3, false)).toBe(3)
    expect(effectiveTrustLevel(0, false)).toBe(0)
  })
})

describe('die Capabilities der Stufen (RBAC-Einspeisung)', () => {
  it('gibt Stufe 0 NICHTS und ab Stufe 1 genau Davids Katalog-Rechte', () => {
    /**
     * Stufe 1 und 2 waren bis zum 2026-08-05 leer, und der Kommentar an der
     * Matrix nannte den Grund: ihre Katalog-Rechte hingen an Funktionen, die
     * es nicht gab („Kommen die Funktionen, kommen ihre Zeilen hierher").
     * Genau das ist mit den privaten Nachrichten passiert — `messages.write`
     * ist Davids TL1-Zuordnung („Basic: private Nachrichten, Melden, …").
     *
     * DASS STUFE 0 LEER BLEIBT, IST KEINE FORMSACHE: an dieser Zeile hängt
     * die A5-Zusage des PN-Konzepts (§ 3). Stünde `messages.write` dort,
     * könnte sich ein Fremder durch das Anschreiben EINES Mitglieds das
     * Lese-Label einer geschlossenen Community verschaffen.
     */
    expect(TRUST_LEVEL_CAPABILITIES[0]).toEqual([])
    expect(TRUST_LEVEL_CAPABILITIES[1]).toEqual(['messages.write'])
    expect(TRUST_LEVEL_CAPABILITIES[2]).toEqual(['messages.write'])
    expect(TRUST_LEVEL_CAPABILITIES[3]).toEqual(['messages.write', 'posts.curate'])
    expect(TRUST_LEVEL_CAPABILITIES[4]).toEqual(['messages.write', 'posts.curate', 'posts.arrange', 'posts.revise'])
  })

  it('nimmt einer höheren Stufe nichts weg', () => {
    // Die Stufen sind kumulativ notiert; eine höhere muss alles der niedrigeren
    // enthalten, sonst verlöre ein Aufstieg ein Recht.
    for (let level = 1; level <= 4; level++) {
      for (const capability of TRUST_LEVEL_CAPABILITIES[(level - 1) as 0 | 1 | 2 | 3]) {
        expect(TRUST_LEVEL_CAPABILITIES[level as 1 | 2 | 3 | 4], `${level}`).toContain(capability)
      }
    }
  })
})

describe('die Stufen-Abzeichen', () => {
  it('hat für jede Stufe genau eines', () => {
    const required = BADGE_CATALOG
      .filter(badge => badge.requires.trustLevel !== undefined)
      .map(badge => badge.requires.trustLevel)
    expect(required).toEqual([1, 2, 3, 4])
  })

  it('verdient bei einem Stand ALLES, was darunter liegt', () => {
    expect(trustLevelBadgeKeysFor(0)).toEqual([])
    expect(trustLevelBadgeKeysFor(1)).toEqual(['trust-basic'])
    expect(trustLevelBadgeKeysFor(3)).toEqual(['trust-basic', 'trust-member', 'trust-regular'])
  })

  it('holt eine übersprungene Stufe mit', () => {
    // Bestandszeile: die Zähler standen längst, die Stufe wurde nie gerechnet.
    // Beim ersten Hinsehen springt sie von 0 auf 2 — beide Abzeichen kommen.
    expect(trustLevelBadgeCrossings(0, 2)).toEqual(['trust-basic', 'trust-member'])
  })

  it('verleiht bei gleichem Stand nichts', () => {
    // Ohne die Differenz liefe jeder Schreibvorgang eines langjährigen
    // Mitglieds in bis zu vier Schreibversuche und deren 409.
    expect(trustLevelBadgeCrossings(3, 3)).toEqual([])
  })

  it('nimmt beim Entzug der Ernennung nichts zurück', () => {
    // Verliehen ist verliehen: die Differenz nach unten ist leer.
    expect(trustLevelBadgeCrossings(4, 3)).toEqual([])
  })
})

describe('der Fortschritt zur nächsten Stufe', () => {
  it('nennt jede Bedingung mit dem, was noch fehlt', () => {
    const progress = trustLevelProgress(0, { memberForDays: 1, contentCreated: 0, upvotesGiven: 0, upvotesReceived: 0 })
    expect(progress?.level).toBe(1)
    expect(progress?.entries.map(entry => [entry.condition, entry.missing])).toEqual([
      ['memberForDays', 1],
      ['contentCreated', 1],
      ['upvotesGiven', 1],
    ])
  })

  it('lässt Bedingungen mit Ziel 0 weg', () => {
    // Stufe 1 verlangt keine erhaltene Zustimmung. „0 von 0" ist keine Aufgabe.
    const progress = trustLevelProgress(0, facts({ memberForDays: 0 }))
    expect(progress?.entries.some(entry => entry.condition === 'upvotesReceived')).toBe(false)
  })

  it('meldet erfüllte Bedingungen als erfüllt, ohne sie zu verstecken', () => {
    // Die Liste zeigt auch das Erreichte — sonst sähe der Weg kürzer aus, als
    // er ist, und man wüsste nicht, was schon zählt.
    const progress = trustLevelProgress(1, facts({ upvotesReceived: 0 }))
    expect(progress?.level).toBe(2)
    const received = progress?.entries.find(entry => entry.condition === 'upvotesReceived')
    expect(received?.met).toBe(false)
    expect(progress?.entries.filter(entry => entry.met).length).toBe(3)
  })

  it('rechnet unbekannte Zugehörigkeit als „es fehlt alles"', () => {
    // Eine ehrliche Zahl ist besser als eine beruhigende: „noch 2 Tage" ist
    // wahr, „noch 0" wäre eine Zusage.
    const progress = trustLevelProgress(0, facts({ memberForDays: null }))
    const days = progress?.entries.find(entry => entry.condition === 'memberForDays')
    expect(days?.current).toBeNull()
    expect(days?.missing).toBe(2)
    expect(days?.met).toBe(false)
  })

  it('schweigt auf der höchsten erarbeitbaren Stufe und bei einer Ernennung', () => {
    expect(trustLevelProgress(3, facts())).toBeNull()
    expect(trustLevelProgress(4, facts())).toBeNull()
  })
})
