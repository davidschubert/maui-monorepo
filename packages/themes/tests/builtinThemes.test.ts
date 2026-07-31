import { describe, expect, it } from 'vitest'
import { builtinNeutralIds, builtinThemeIds, builtinThemeName, builtinVariantIds, isBuiltinNeutralSelection, isBuiltinTheme, isBuiltinThemeSelection } from '../shared/builtinThemes'

/**
 * Diese Funktionen sind die EINZIGE Validierungsquelle für die Theme-Wahl
 * eines Mandanten (Entscheidung 12) — sie entscheiden serverseitig über
 * `tenants.theme/variant`, also über das, was als data-theme/data-variant im
 * <html> jeder Community-Seite landet. Fail-closed ist hier kein Detail.
 */
describe('Built-in-Katalog als Validierungsquelle', () => {
  it('kennt den Vollausbau (Pukalani-Default + 26 Farbwelten)', () => {
    const ids = builtinThemeIds()
    expect(ids[0]).toBe('default')
    expect(ids.length).toBe(27)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('erkennt die Vibe-Themes des Onboardings wieder', () => {
    // Was der Wizard schreiben darf, muss der Picker später auch wählen dürfen.
    for (const id of ['lagoon', 'coral', 'spring', 'denim', 'crimson', 'graphite']) {
      expect(isBuiltinTheme(id), id).toBe(true)
    }
  })

  it('liest den Anzeigenamen aus der Registry', () => {
    expect(builtinThemeName('crimson')).toBe('Crimson')
    expect(builtinThemeName('gibt-es-nicht')).toBe('')
  })

  it('nennt das Standard-Theme „Aloha" — Label, nicht Id', () => {
    // Davids Entscheidung 2026-07-29 (B3): „Sunrise" stand im Picker neben der
    // Katalog-Farbwelt „Sunset". Die ID darf dabei NIE mitwandern — sie steckt
    // in tenants.theme, data-theme, CSS-Dateinamen und gespeicherten Configs.
    expect(builtinThemeName('default')).toBe('Aloha')
    expect(isBuiltinTheme('default')).toBe(true)
    expect(isBuiltinTheme('aloha')).toBe(false)
  })

  it('hat keine zwei gleichen Anzeigenamen', () => {
    // Der Grund für die Umbenennung: zwei verwandt klingende Namen für
    // Unverwandtes. Doppelte Namen wären im 27er-Grid gar nicht zu trennen.
    const names = builtinThemeIds().map(id => builtinThemeName(id))
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('Auswahl {theme, variant} prüfen — fail-closed', () => {
  it('nimmt ein Built-in mit einer seiner Varianten', () => {
    expect(builtinVariantIds('crimson')).toContain('deep')
    expect(isBuiltinThemeSelection('crimson', 'deep')).toBe(true)
  })

  it('nimmt ein Built-in ohne Variante (Basisfarbe der Welt)', () => {
    expect(isBuiltinThemeSelection('crimson', '')).toBe(true)
  })

  it('weist eine FREMDE Variante ab, auch wenn es sie bei einem anderen Theme gibt', () => {
    // 'ink' gehört zu graphite. Die CSS-Regel
    // [data-theme='crimson'][data-variant='ink'] existiert nicht — die Seite
    // fiele still auf die Basisfarbe zurück, ein Fehler ohne Symptom.
    expect(builtinVariantIds('graphite')).toContain('ink')
    expect(isBuiltinThemeSelection('crimson', 'ink')).toBe(false)
  })

  it('weist unbekannte Themes ab', () => {
    expect(isBuiltinThemeSelection('gibt-es-nicht', '')).toBe(false)
  })

  it('weist Custom Themes ab — die liegen pro Projekt, nicht pro Mandant', () => {
    expect(isBuiltinThemeSelection('c-abc123', '')).toBe(false)
    expect(isBuiltinThemeSelection('c-draft', '')).toBe(false)
  })

  it('weist Attribut-Einschmuggeln ab', () => {
    for (const evil of ['crimson\' onload=x', 'crimson"]', '../../etc', 'CRIMSON']) {
      expect(isBuiltinThemeSelection(evil, ''), evil).toBe(false)
    }
  })

  it('lässt das Zurücksetzen zu — aber nur ganz', () => {
    // '' = Instanz-Einstellung. Eine Variante ohne Theme wäre bedeutungslos.
    expect(isBuiltinThemeSelection('', '')).toBe(true)
    expect(isBuiltinThemeSelection('', 'deep')).toBe(false)
  })

  it('der Pukalani-Default hat keine Varianten', () => {
    expect(builtinVariantIds('default')).toEqual([])
    expect(isBuiltinThemeSelection('default', '')).toBe(true)
    expect(isBuiltinThemeSelection('default', 'deep')).toBe(false)
  })
})

/**
 * Die Neutral-Palette eines Mandanten (`tenants.neutral`, control-020, Rest von
 * B5) — dieselbe fail-closed-Prüfung, dieselbe einzige Quelle
 * (`NEUTRAL_REGISTRY`). Der Wert landet als data-neutral im <html>.
 */
describe('Neutral-Palette als Mandanten-Wahl prüfen', () => {
  it('kennt die 9 Registry-Paletten', () => {
    const ids = builtinNeutralIds()
    expect(ids).toContain('mist')
    expect(ids.length).toBe(9)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('nimmt jede Registry-Palette', () => {
    for (const id of builtinNeutralIds()) expect(isBuiltinNeutralSelection(id), id).toBe(true)
  })

  it('lässt das Zurücksetzen zu (\'\' = Voreinstellung der Instanz)', () => {
    expect(isBuiltinNeutralSelection('')).toBe(true)
  })

  it('weist die getönte Ramp eines Custom Themes ab', () => {
    // Sie hängt an einer custom_themes-Row, die dem PROJEKT gehört (im Pool
    // allen Communities gemeinsam) und die der Betreiber jederzeit löscht —
    // dieselbe Begründung wie bei Custom Themes selbst.
    expect(isBuiltinNeutralSelection('c-abc123')).toBe(false)
  })

  it('weist Unbekanntes und Attribut-Einschmuggeln ab', () => {
    for (const evil of ['gibt-es-nicht', 'MIST', 'mist\' onload=x', 'mist"]', '../../etc']) {
      expect(isBuiltinNeutralSelection(evil), evil).toBe(false)
    }
  })
})
