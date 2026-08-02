import { describe, expect, it } from 'vitest'
import { APPWRITE_PHRASE_WORDS, decoySecurityPhrase } from '../server/utils/securityPhrase'

/**
 * Nacht-Audit 2026-08-02, F35: die Attrappen-Sicherheitsphrase im OTP-Pfad
 * kam aus einer SELBST erfundenen Wortliste — und schrieb BEIDE Wörter groß
 * („Amber Anchor"). Appwrite baut sie aus einem großgeschriebenen Adjektiv und
 * einem KLEINgeschriebenen Substantiv („Radiant zebra",
 * src/Appwrite/Auth/Phrase.php). Damit war jede Attrappe ohne jede
 * Listenkenntnis erkennbar — die Konten-Enumeration, die der stille Pfad
 * verhindern sollte, funktionierte weiter.
 *
 * Diese Tests nageln fest, dass die Attrappe aus DERSELBEN Verteilung kommt.
 */
describe('Appwrites Wortlisten (Snapshot aus 1.9.6, verbatim)', () => {
  it('hat den Umfang der Originale — auch die Dubletten', () => {
    // Kürzt jemand die Listen oder dedupliziert sie, ändert sich die
    // Verteilung und die Attrappe wird wieder unterscheidbar.
    expect(APPWRITE_PHRASE_WORDS.adjectives).toHaveLength(129)
    expect(APPWRITE_PHRASE_WORDS.nouns).toHaveLength(104)
    // Die Substantivliste enthält bei Appwrite drei Dubletten.
    const uniqueNouns = new Set(APPWRITE_PHRASE_WORDS.nouns)
    expect(uniqueNouns.size).toBe(101)
    for (const dupe of ['umbrella', 'globe', 'xylograph']) {
      expect(APPWRITE_PHRASE_WORDS.nouns.filter(n => n === dupe)).toHaveLength(2)
    }
  })

  it('Adjektive groß, Substantive klein — das ist der eigentliche Befund', () => {
    for (const word of APPWRITE_PHRASE_WORDS.adjectives) {
      expect(word[0], word).toBe(word[0]!.toUpperCase())
    }
    for (const word of APPWRITE_PHRASE_WORDS.nouns) {
      expect(word, word).toBe(word.toLowerCase())
    }
  })

  it('enthält KEINES der alten Eigenbau-Substantive in Großschreibung', () => {
    // Die alte Liste lautete Anchor/Bridge/Canyon/… — jedes davon wäre heute
    // ein sofortiges Erkennungsmerkmal.
    const old = ['Anchor', 'Bridge', 'Canyon', 'Compass', 'Falcon', 'Garden', 'Harbor', 'Island', 'Lantern', 'Meadow', 'Mountain', 'Otter', 'River', 'Summit', 'Thunder', 'Willow']
    for (const word of old) expect(APPWRITE_PHRASE_WORDS.nouns).not.toContain(word)
  })
})

describe('decoySecurityPhrase — statistisch unauffällig', () => {
  it('hat immer die Form „<Adjektiv aus der Liste> <Substantiv aus der Liste>"', () => {
    for (let i = 0; i < 500; i++) {
      const phrase = decoySecurityPhrase()
      const [adjective, ...rest] = phrase.split(' ')
      const noun = rest.join(' ') // „ice cream" trägt ein Leerzeichen
      expect(APPWRITE_PHRASE_WORDS.adjectives, phrase).toContain(adjective)
      expect(APPWRITE_PHRASE_WORDS.nouns, phrase).toContain(noun)
    }
  })

  it('das zweite Wort ist KLEIN geschrieben (der Befund, direkt geprüft)', () => {
    for (let i = 0; i < 200; i++) {
      const noun = decoySecurityPhrase().split(' ').slice(1).join(' ')
      expect(noun).toBe(noun.toLowerCase())
    }
  })

  it('zieht wirklich zufällig — nicht immer dasselbe Wortpaar', () => {
    const seen = new Set(Array.from({ length: 200 }, () => decoySecurityPhrase()))
    expect(seen.size).toBeGreaterThan(50)
  })
})
