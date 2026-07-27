/**
 * Regressions-Wächter für Audit-Befund S3 (live auf demo.pukalani.app/de):
 * interne Links in CMS-Seiteninhalten zeigten auf die EN-Route und trugen
 * rel="nofollow".
 *
 * Die Klassifizierung selbst gehört dem CORE, nicht diesem Layer: pages
 * rendert seine Inhalte über den geteilten Core-Sink `MarkdownContent`
 * (kein MDC/Prose im pages-Layer), und ein Fundament-Layer darf nie von
 * einem Feature-Layer abhängen (CONCEPT.md A14). Dieser Test hält die für
 * CMS-Seiten relevanten Fälle dort fest, wo der Befund aufgeschlagen ist —
 * relativer Import, weil im Vitest-Node-Kontext kein Auto-Import existiert.
 */
import { describe, expect, it } from 'vitest'
import { classifyContentLink } from '../../core/shared/contentLinks'

const locales = ['en', 'de']

describe('CMS-Link-Policy (Befund S3)', () => {
  it('Seed-Link [Feed](/feed) ist ein eigener Pfad und wird lokalisiert', () => {
    expect(classifyContentLink('/feed', locales)).toBe('internal')
  })

  it('bereits präfixierte Autoren-Links bleiben unangetastet', () => {
    expect(classifyContentLink('/de/impressum', locales)).toBe('internal-localized')
  })

  it('fremde Ziele bleiben fremd (nofollow/noreferrer/_blank)', () => {
    expect(classifyContentLink('https://pukalani.app', locales)).toBe('external')
  })
})
