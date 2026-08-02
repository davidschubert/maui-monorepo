import { describe, expect, it } from 'vitest'
import { runtimeProjectMatches } from '../server/utils/onboardingService'

/**
 * Nacht-Audit 2026-08-02, F33: die beiden DSGVO-Routen der Naht
 * (`community/members/user-data`, `community/members/user-erase`) kommen ohne
 * JWT und nahmen `runtimeProjectId` ungeprüft aus dem Body. Wer das
 * Service-Secret hatte, konnte damit Mitgliedschaften und Einladungsadressen in
 * JEDEM Runtime-Projekt auslesen und löschen — auch im Silo eines fremden
 * Kunden. Seither hält `assertOnboardingRuntimeProject` das genannte Projekt
 * gegen das EINE, das die Naht bedient (`onboardingRuntimeProject`); die reine
 * Vergleichsregel steht hier.
 */
describe('runtimeProjectMatches', () => {
  it('das eigene Pool-Projekt passt', () => {
    expect(runtimeProjectMatches('pool', 'pool')).toBe(true)
    // Whitespace aus Env-Dateien darf nicht zum Ausfall führen.
    expect(runtimeProjectMatches('pool', ' pool ')).toBe(true)
    expect(runtimeProjectMatches(' pool\n', 'pool')).toBe(true)
  })

  it('ein FREMDES Projekt passt nicht (der Befund)', () => {
    for (const claimed of ['comments', 'control', 'silo-bigcorp', 'pool2', 'poo']) {
      expect(runtimeProjectMatches('pool', claimed), claimed).toBe(false)
    }
  })

  it('Appwrite-Projekt-Ids sind case-sensitiv — also auch der Vergleich', () => {
    expect(runtimeProjectMatches('Pool', 'pool')).toBe(false)
    expect(runtimeProjectMatches('pool', 'POOL')).toBe(false)
  })

  it('leeres/whitespace-Projekt passt NIE — auch nicht auf sich selbst', () => {
    // Wäre eine Konfiguration je leer, dürfte ein leerer Body nicht „passen".
    // (In der Praxis wirft `onboardingRuntimeProject` davor schon 500.)
    expect(runtimeProjectMatches('', '')).toBe(false)
    expect(runtimeProjectMatches('   ', '')).toBe(false)
    expect(runtimeProjectMatches('pool', '')).toBe(false)
    expect(runtimeProjectMatches('', 'pool')).toBe(false)
  })
})
