import { describe, expect, it } from 'vitest'
import { resolveNeutralSelection, resolveThemeSelection, visitorMayChooseNeutral, visitorMayChooseTheme } from '../shared/themeSelection'

/**
 * Die Vorrangregel der Farbwelt (Davids Entscheidung 2026-07-29, B5).
 * Beantwortet für jeden Host-Typ: WESSEN Wahl landet als data-theme im HTML?
 *
 * Der Fall, der das Produktversprechen hält, ist der erste: ein Besucher mit
 * eigenem Theme-Cookie auf dem Host einer Community sieht DEREN Farben.
 */
const instance = { instanceTheme: 'graphite', instanceVariant: 'ink' }

describe('Mandanten-Host: die Community gewinnt', () => {
  it('überstimmt das Cookie des Besuchers', () => {
    expect(resolveThemeSelection({
      cookieTheme: 'berry',
      cookieVariant: 'vivid',
      branding: { theme: 'crimson', variant: 'deep' },
      ...instance,
    })).toEqual({ theme: 'crimson', variant: 'deep', source: 'community' })
  })

  it('nimmt die Basisfarbe, wenn die Community keine Variante gewählt hat', () => {
    expect(resolveThemeSelection({
      cookieTheme: 'berry',
      cookieVariant: 'vivid',
      branding: { theme: 'crimson', variant: '' },
      ...instance,
    })).toEqual({ theme: 'crimson', variant: '', source: 'community' })
  })

  it('fällt OHNE eigene Wahl der Community auf die Instanz-Einstellung — nicht auf das Cookie', () => {
    // Der dritte Zustand von useTenantBranding: Mandanten-Host, aber
    // { theme: '', variant: '' }. Dort ist die Instanz-Einstellung faktisch
    // die Farbe der Community — sie muss für ALLE Besucher gleich sein.
    expect(resolveThemeSelection({
      cookieTheme: 'berry',
      cookieVariant: 'vivid',
      branding: { theme: '', variant: '' },
      ...instance,
    })).toEqual({ theme: 'graphite', variant: 'ink', source: 'instance' })
  })

  it('bleibt beim Registry-Default, wenn auch die Instanz nichts gesetzt hat', () => {
    expect(resolveThemeSelection({
      cookieTheme: 'berry',
      cookieVariant: null,
      branding: { theme: '', variant: '' },
    })).toEqual({ theme: '', variant: '', source: 'instance' })
  })

  it('zeigt dem Besucher keinen Theme-Wähler', () => {
    expect(visitorMayChooseTheme({ theme: 'crimson', variant: '' })).toBe(false)
    expect(visitorMayChooseTheme({ theme: '', variant: '' })).toBe(false)
  })
})

describe('Kein Mandanten-Host (Silo, Kontroll-Host, Playground): der Besucher gewinnt', () => {
  it('nimmt das Theme-Cookie', () => {
    expect(resolveThemeSelection({
      cookieTheme: 'berry',
      cookieVariant: 'vivid',
      branding: null,
      ...instance,
    })).toEqual({ theme: 'berry', variant: 'vivid', source: 'visitor' })
  })

  it('nimmt eine allein gewählte Variante zum Instanz-Theme', () => {
    expect(resolveThemeSelection({
      cookieTheme: null,
      cookieVariant: 'dusk',
      branding: null,
      ...instance,
    })).toEqual({ theme: 'graphite', variant: 'dusk', source: 'visitor' })
  })

  it('nimmt ohne Cookie die Instanz-Einstellung', () => {
    expect(resolveThemeSelection({
      cookieTheme: null,
      cookieVariant: null,
      branding: null,
      ...instance,
    })).toEqual({ theme: 'graphite', variant: 'ink', source: 'instance' })
  })

  it('vergisst die Instanz-Variante, sobald der Besucher selbst ein Theme wählt', () => {
    // Wie bisher: wer selbst wählt (auch die Basisfarbe), behält seine Wahl.
    expect(resolveThemeSelection({
      cookieTheme: 'berry',
      cookieVariant: null,
      branding: null,
      ...instance,
    })).toEqual({ theme: 'berry', variant: '', source: 'visitor' })
  })

  it('zeigt dem Besucher den Theme-Wähler', () => {
    expect(visitorMayChooseTheme(null)).toBe(true)
  })
})

/**
 * Die NEUTRAL-PALETTE (`data-neutral`, gedeckte Grau-Tönung) — eigene Achse,
 * dieselbe Vorrangregel. Davids Entscheidung vom 2026-07-29 (Rest von B5): sie
 * folgt der Community. Bis dahin gewann hier immer das Cookie, weil es keine
 * Community-Einstellung gab; die gibt es jetzt (`tenants.neutral`, control-020).
 *
 * `neutral: ''` (bzw. das Feld ganz weglassen) heißt „keine eigene Wahl", und
 * das Ergebnis '' heißt „keine Vorgabe" — der Aufrufer (useTheme) nimmt dann
 * seine Fallback-Kette: getönte Ramp des aktiven Themes, sonst der
 * Registry-Default `mist`. Es gibt bewusst keine Instanz-Einstellung dafür.
 */
describe('Neutral-Palette: Mandanten-Host ⇒ die Community', () => {
  it('überstimmt das Neutral-Cookie des Besuchers', () => {
    expect(resolveNeutralSelection({
      cookieNeutral: 'olive',
      branding: { theme: 'crimson', variant: 'deep', neutral: 'taupe' },
    })).toEqual({ neutral: 'taupe', source: 'community' })
  })

  it('gilt auch, wenn die Community KEIN Theme, aber eine Palette gewählt hat', () => {
    // Getrennte Achsen: „nur der Grundton, Farbwelt wie voreingestellt" ist ein
    // gültiger und plausibler Zustand.
    expect(resolveNeutralSelection({
      cookieNeutral: 'olive',
      branding: { theme: '', variant: '', neutral: 'stone' },
    })).toEqual({ neutral: 'stone', source: 'community' })
  })

  it('fällt OHNE eigene Wahl der Community auf die Voreinstellung — nicht auf das Cookie', () => {
    expect(resolveNeutralSelection({
      cookieNeutral: 'olive',
      branding: { theme: 'crimson', variant: 'deep', neutral: '' },
    })).toEqual({ neutral: '', source: 'instance' })
  })

  it('behandelt ein FEHLENDES Feld wie „keine Wahl" (Bestands-Rows vor control-020)', () => {
    // Appwrite backfillt Spalten-Defaults nicht — eine alte tenants-Row liest
    // die Spalte als undefined. Das darf niemanden umfärben und den Besucher
    // trotzdem nicht wieder gewinnen lassen.
    expect(resolveNeutralSelection({
      cookieNeutral: 'olive',
      branding: { theme: 'crimson', variant: 'deep' },
    })).toEqual({ neutral: '', source: 'instance' })
  })

  it('zeigt dem Besucher kein Neutral-Untermenü', () => {
    expect(visitorMayChooseNeutral({ theme: '', variant: '', neutral: 'mauve' })).toBe(false)
    expect(visitorMayChooseNeutral({ theme: '', variant: '', neutral: '' })).toBe(false)
    expect(visitorMayChooseNeutral({ theme: 'crimson', variant: 'deep' })).toBe(false)
  })
})

describe('Neutral-Palette: kein Mandanten-Host (Silo, Kontroll-Host, Playground)', () => {
  it('nimmt das Neutral-Cookie des Besuchers', () => {
    expect(resolveNeutralSelection({
      cookieNeutral: 'olive',
      branding: null,
    })).toEqual({ neutral: 'olive', source: 'visitor' })
  })

  it('gibt ohne Cookie keine Vorgabe zurück (Aufrufer nimmt seine Fallback-Kette)', () => {
    expect(resolveNeutralSelection({
      cookieNeutral: null,
      branding: null,
    })).toEqual({ neutral: '', source: 'instance' })
  })

  it('behandelt ein leeres Cookie wie keins', () => {
    expect(resolveNeutralSelection({
      cookieNeutral: '',
      branding: null,
    })).toEqual({ neutral: '', source: 'instance' })
  })

  it('zeigt dem Besucher das Neutral-Untermenü', () => {
    expect(visitorMayChooseNeutral(null)).toBe(true)
  })
})

describe('Die zwei Achsen bleiben unabhängig', () => {
  it('Instanz-Host: Theme aus der Instanz, Palette vom Besucher', () => {
    // Beide Rechnungen aus DEMSELBEN Zustand — die Herkunft darf verschieden
    // sein, deshalb gibt es zwei Funktionen und kein gemeinsames `source`.
    const state = { branding: null, ...instance }
    expect(resolveThemeSelection({ cookieTheme: null, cookieVariant: null, ...state }))
      .toEqual({ theme: 'graphite', variant: 'ink', source: 'instance' })
    expect(resolveNeutralSelection({ cookieNeutral: 'mauve', branding: null }))
      .toEqual({ neutral: 'mauve', source: 'visitor' })
  })

  it('Mandanten-Host: beide gehören der Community', () => {
    const branding = { theme: 'lagoon', variant: '', neutral: 'stone' }
    expect(resolveThemeSelection({ cookieTheme: 'berry', cookieVariant: 'vivid', branding, ...instance }))
      .toEqual({ theme: 'lagoon', variant: '', source: 'community' })
    expect(resolveNeutralSelection({ cookieNeutral: 'olive', branding }))
      .toEqual({ neutral: 'stone', source: 'community' })
  })
})
