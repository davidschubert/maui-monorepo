import { describe, expect, it } from 'vitest'
import { classifyContentLink } from '../shared/contentLinks'

const locales = ['en', 'de']

describe('classifyContentLink', () => {
  it('erkennt fremde Ziele', () => {
    expect(classifyContentLink('https://example.com', locales)).toBe('external')
    expect(classifyContentLink('http://example.com/x?y=1', locales)).toBe('external')
  })

  it('behandelt protokoll-relative und unerwartete Ziele defensiv als fremd', () => {
    // isSafeHref lässt diese ohnehin nicht durch — der Renderer darf sie
    // trotzdem NIE als eigenen Pfad behandeln.
    expect(classifyContentLink('//evil.com', locales)).toBe('external')
    expect(classifyContentLink('mailto:a@b.de', locales)).toBe('external')
    expect(classifyContentLink('javascript:alert(1)', locales)).toBe('external')
    expect(classifyContentLink('', locales)).toBe('external')
  })

  it('erkennt eigene Pfade ohne Locale-Prefix', () => {
    expect(classifyContentLink('/feed', locales)).toBe('internal')
    expect(classifyContentLink('/', locales)).toBe('internal')
    expect(classifyContentLink('/imprint?x=1', locales)).toBe('internal')
    expect(classifyContentLink('/community#top', locales)).toBe('internal')
  })

  it('erkennt bereits präfixierte Pfade (bleiben unangetastet)', () => {
    expect(classifyContentLink('/de/feed', locales)).toBe('internal-localized')
    expect(classifyContentLink('/en/imprint', locales)).toBe('internal-localized')
    expect(classifyContentLink('/de', locales)).toBe('internal-localized')
    expect(classifyContentLink('/de?x=1', locales)).toBe('internal-localized')
    expect(classifyContentLink('/DE/feed', locales)).toBe('internal-localized')
  })

  it('verwechselt Segmente NICHT mit Locale-Codes (Prefix-Ähnlichkeit)', () => {
    expect(classifyContentLink('/deutschland', locales)).toBe('internal')
    expect(classifyContentLink('/dentist/x', locales)).toBe('internal')
    expect(classifyContentLink('/events/de', locales)).toBe('internal')
  })

  it('folgt der konfigurierten Locale-Liste, nicht einer festen Annahme', () => {
    expect(classifyContentLink('/fr/feed', locales)).toBe('internal')
    expect(classifyContentLink('/fr/feed', ['en', 'fr'])).toBe('internal-localized')
  })
})
