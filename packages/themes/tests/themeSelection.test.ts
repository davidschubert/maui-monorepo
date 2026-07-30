import { describe, expect, it } from 'vitest'
import { resolveThemeSelection, visitorMayChooseTheme } from '../shared/themeSelection'

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
