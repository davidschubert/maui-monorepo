import { describe, expect, it } from 'vitest'
import { viewBufferKey, viewDedupeSubject } from '../shared/topicViewKeys'

/**
 * F1 Stufe 2 — die zwei Schlüssel der Aufruf-Zählung.
 *
 * Beide Tests unten sind Gegenproben gegen eine STILLE Verwechslung: falsche
 * Zahlen, die plausibel aussehen. Genau deshalb stehen die Regeln in einer
 * eigenen Datei und nicht als Interpolation in der Aufrufstelle.
 */

describe('viewBufferKey', () => {
  it('trennt zwei Mandanten', () => {
    expect(viewBufferKey('pool:t-a', 'p1')).not.toBe(viewBufferKey('pool:t-b', 'p1'))
  })

  it('GEGENPROBE: kollidiert NICHT, obwohl der Scope selbst Doppelpunkte enthält', () => {
    // Der Grund für das Trennzeichen. Mit ':' wären diese beiden Schlüssel
    // identisch — und die Aufrufe von „pool:t-a:b" landeten auf einem Topic
    // von „pool:t-a". Eine Fehlbuchung über die Mandantengrenze, die niemand
    // bemerkt, weil beide Zahlen plausibel bleiben.
    expect(viewBufferKey('pool:t-a', 'b:c')).not.toBe(viewBufferKey('pool:t-a:b', 'c'))
  })

  it('liefert mit leerer Id das Präfix des Mandanten — und dieses Präfix passt NUR auf ihn', () => {
    const prefix = viewBufferKey('pool:t-a', '')
    expect(viewBufferKey('pool:t-a', 'p1').startsWith(prefix)).toBe(true)
    expect(viewBufferKey('pool:t-ab', 'p1').startsWith(prefix)).toBe(false)
  })

  it('trägt den Silo-/Einzelbetrieb-Scope genauso', () => {
    expect(viewBufferKey('single', 'p1')).not.toBe(viewBufferKey('silo:proj', 'p1'))
  })
})

describe('viewDedupeSubject', () => {
  it('nimmt das Konto, wenn es eines gibt', () => {
    expect(viewDedupeSubject('user-1', '10.0.0.1')).toBe('u:user-1')
  })

  it('GEGENPROBE: zwei angemeldete Menschen hinter DERSELBEN IP zählen getrennt', () => {
    // Sonst würde in einem Büro der zweite Leser eines Themas nie gezählt.
    expect(viewDedupeSubject('user-1', '10.0.0.1')).not.toBe(viewDedupeSubject('user-2', '10.0.0.1'))
  })

  it('fällt ohne Konto auf die IP zurück', () => {
    expect(viewDedupeSubject(undefined, '10.0.0.1')).toBe('ip:10.0.0.1')
    expect(viewDedupeSubject('', '10.0.0.1')).toBe('ip:10.0.0.1')
  })

  it('GEGENPROBE: eine User-Id kann nie mit einer IP zusammenfallen', () => {
    expect(viewDedupeSubject('10.0.0.1', null)).not.toBe(viewDedupeSubject(null, '10.0.0.1'))
  })

  it('ohne Konto UND ohne IP: kein Subjekt — die Aufrufstelle zählt dann NICHT', () => {
    // Der wichtigste Fall dieser Datei. Ein leerer Rückgabewert heißt „nicht
    // wiedererkennbar"; würde die Aufrufstelle das als gültiges Subjekt
    // behandeln, wäre ausgerechnet die einzige Quelle ohne Wiedererkennung die
    // einzige, die beliebig oft zählen darf.
    expect(viewDedupeSubject(undefined, undefined)).toBe('')
    expect(viewDedupeSubject('  ', '  ')).toBe('')
  })
})
