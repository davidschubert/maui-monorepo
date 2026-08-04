import { describe, expect, it } from 'vitest'
import {
  BADGE_CATALOG,
  type BadgeFacts,
  badgeEarned,
  badgeThresholds,
  earnedBadgeKeys,
  emptyBadgeFacts,
} from '../shared/badges'

/** Ein Mensch ohne jede Spur — der Ausgangszustand jeder Prüfung. */
function facts(overrides: Partial<BadgeFacts> = {}): BadgeFacts {
  return { ...emptyBadgeFacts(), ...overrides }
}

function badge(key: string) {
  const found = BADGE_CATALOG.find(entry => entry.key === key)
  if (!found) throw new Error(`Abzeichen "${key}" fehlt im Katalog`)
  return found
}

describe('der Katalog selbst', () => {
  it('hat eindeutige Schlüssel', () => {
    // Zwei Zeilen mit demselben Schlüssel wären im Unique-Index (posts-012)
    // EINE Zeile — das zweite Abzeichen könnte nie verliehen werden.
    const keys = BADGE_CATALOG.map(entry => entry.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('gibt jedem Abzeichen eine Bedingung', () => {
    // Ein Abzeichen ohne Bedingung wäre für JEDEN sofort erfüllt.
    for (const entry of BADGE_CATALOG) {
      expect(Object.keys(entry.requires).length, entry.key).toBeGreaterThan(0)
    }
  })

  it('ist für einen Menschen ohne jede Spur vollständig LEER', () => {
    // Die Gegenprobe zur Zeile darüber, und die wichtigere: keine einzige
    // Bedingung darf bei lauter Nullen zufällig zutreffen.
    expect(earnedBadgeKeys(facts())).toEqual([])
  })
})

describe('badgeThresholds — was die Quellen zählen müssen', () => {
  it('sammelt jede geforderte Schwelle, aufsteigend und ohne Doppel', () => {
    expect(badgeThresholds()).toEqual([1, 2, 5, 10, 25, 50])
  })

  it('lässt keine Bedingung des Katalogs ungemessen', () => {
    // DER Test dieser Datei: eine Schwelle, die niemand zählt, kommt in den
    // Zahlen als 0 an — das Abzeichen wäre dann nicht „schwer", sondern
    // unerreichbar, und zwar lautlos.
    const measured = new Set(badgeThresholds())
    for (const entry of BADGE_CATALOG) {
      for (const requirement of [entry.requires.likedItems, entry.requires.likedTopics, entry.requires.likedReplies]) {
        if (requirement) expect(measured.has(requirement.threshold), `${entry.key}/${requirement.threshold}`).toBe(true)
      }
    }
  })
})

describe('die einzelnen Bedingungen', () => {
  it('Profil: Text UND Bild — ein halbes Profil reicht nicht', () => {
    expect(badgeEarned(badge('profile'), facts({ profileComplete: false }))).toBe(false)
    expect(badgeEarned(badge('profile'), facts({ profileComplete: true }))).toBe(true)
  })

  it('Erster Zuspruch: eine vergebene Stimme genügt', () => {
    expect(badgeEarned(badge('first-like'), facts({ likesGiven: 0 }))).toBe(false)
    expect(badgeEarned(badge('first-like'), facts({ likesGiven: 1 }))).toBe(true)
  })

  it('Erste Meldung hängt an den Meldungen, nicht an den Stimmen', () => {
    expect(badgeEarned(badge('first-flag'), facts({ likesGiven: 500 }))).toBe(false)
    expect(badgeEarned(badge('first-flag'), facts({ flagsRaised: 1 }))).toBe(true)
  })

  it('Dankeschön verlangt BEIDES — bekommen und gegeben', () => {
    // Der Fall, für den die UND-Regel überhaupt existiert: wer 20-mal gelobt
    // wurde, aber nie selbst gelobt hat, bekommt es nicht.
    expect(badgeEarned(badge('thank-you'), facts({ likedItems: { 1: 20 }, likesGiven: 9 }))).toBe(false)
    expect(badgeEarned(badge('thank-you'), facts({ likedItems: { 1: 19 }, likesGiven: 10 }))).toBe(false)
    expect(badgeEarned(badge('thank-you'), facts({ likedItems: { 1: 20 }, likesGiven: 10 }))).toBe(true)
  })

  it('Anerkannt zählt die Schwelle 2, nicht die Schwelle 1', () => {
    // 100 Inhalte mit je EINER Stimme sind nicht dasselbe wie 100 mit zwei —
    // ein Zugriff auf die falsche Schwelle würde das Abzeichen verschenken.
    expect(badgeEarned(badge('respected'), facts({ likedItems: { 1: 500, 2: 99 } }))).toBe(false)
    expect(badgeEarned(badge('respected'), facts({ likedItems: { 2: 100 } }))).toBe(true)
  })

  it('trennt Beiträge und Antworten', () => {
    // Der Grund für die zwei getrennten Zähler: ein starker Beitrag ist kein
    // „Gute Antwort" und umgekehrt.
    const nurBeitrag = facts({ likedTopics: { 10: 1 } })
    expect(badgeEarned(badge('nice-topic'), nurBeitrag)).toBe(true)
    expect(badgeEarned(badge('nice-reply'), nurBeitrag)).toBe(false)

    const nurAntwort = facts({ likedReplies: { 10: 1 } })
    expect(badgeEarned(badge('nice-reply'), nurAntwort)).toBe(true)
    expect(badgeEarned(badge('nice-topic'), nurAntwort)).toBe(false)
  })

  it('staffelt die Schreib-Abzeichen: 50 Stimmen bringen alle drei', () => {
    const stark = facts({ likedTopics: { 10: 1, 25: 1, 50: 1 } })
    expect(earnedBadgeKeys(stark)).toEqual(['nice-topic', 'good-topic', 'great-topic'])
  })

  it('eine fehlende Schwelle in den Zahlen heißt „nicht erreicht", nicht „egal"', () => {
    // So kommt eine ausgefallene Zähl-Quelle an: der Schlüssel fehlt. Das darf
    // nie zu einer Verleihung führen.
    expect(badgeEarned(badge('welcome'), facts({ likedItems: {} }))).toBe(false)
  })
})

describe('earnedBadgeKeys', () => {
  it('liefert in Katalog-Reihenfolge', () => {
    const all = earnedBadgeKeys(facts({
      profileComplete: true,
      likesGiven: 1,
      likedItems: { 1: 1 },
    }))
    expect(all).toEqual(['profile', 'first-like', 'welcome'])
  })
})
