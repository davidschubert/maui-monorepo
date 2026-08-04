/**
 * Wächter für die Community-Regeln (F1 Stufe 2, Davids Entscheidung 6).
 *
 * Wie bei den Rechtsvorlagen werden EIGENSCHAFTEN geprüft, nicht Wortlaut: der
 * Text darf jederzeit besser werden, aber nie die Parsebarkeit verlieren, nie
 * zur Rechtsaussage werden und nie in einer Sprache leer sein.
 *
 * Der wichtigste Test unten ist der auf FEHLENDE Platzhalter — das genaue
 * Gegenteil dessen, was `legal-templates.test.ts` erzwingt. Der Unterschied ist
 * kein Zufall, sondern der Grund für zwei getrennte Vorlagen-Dateien: die
 * Rechtstexte entstehen als Entwurf und MÜSSEN unfertig aussehen, die Regeln
 * entstehen veröffentlicht und dürfen es nicht.
 */
import { describe, expect, it } from 'vitest'
import { GUIDELINES_SLUG } from '../shared/types/page'
import { GUIDELINES_SORT_ORDER, guidelinesTemplate, guidelinesTemplateLocale } from '../shared/guidelinesTemplate'
import { createPageUpsertSchema } from '../schemas/page'
import { parseMarkdown } from '../../core/shared/markdown'

const schema = createPageUpsertSchema()
const LOCALES = ['de', 'en'] as const

describe('Guidelines-Vorlage', () => {
  it('trägt die eine Adresse aus types/page.ts', () => {
    // Die Zeichenkette steht bewusst NICHT zweimal im Repo: der
    // Navigationspunkt in blueprint liest dieselbe Konstante.
    for (const locale of LOCALES) expect(guidelinesTemplate(locale).slug).toBe(GUIDELINES_SLUG)
  })

  it('steht in der Navigation vor den Rechtsseiten (90/91)', () => {
    expect(GUIDELINES_SORT_ORDER).toBeLessThan(90)
    for (const locale of LOCALES) expect(guidelinesTemplate(locale).sortOrder).toBe(GUIDELINES_SORT_ORDER)
  })

  it('fällt für unbekannte Sprachen auf Englisch zurück (nie leer)', () => {
    expect(guidelinesTemplateLocale('de-AT')).toBe('de')
    expect(guidelinesTemplateLocale('fr')).toBe('en')
    expect(guidelinesTemplateLocale(null)).toBe('en')
    expect(guidelinesTemplate('fr')).toEqual(guidelinesTemplate('en'))
  })

  it('GEGENPROBE: enthält KEINE Platzhalter — sie wird veröffentlicht', () => {
    // Genau umgekehrt zu den Rechtsvorlagen. Ein `[AUSFÜLLEN: …]` auf einer
    // öffentlich erreichbaren Seite ist eine kaputte Seite, und der Seed setzt
    // hier `status: 'published'`.
    for (const locale of LOCALES) {
      expect(guidelinesTemplate(locale).body).not.toContain('[AUSFÜLLEN:')
      expect(guidelinesTemplate(locale).body).not.toContain('[FILL IN:')
    }
  })

  it('GEGENPROBE: macht keine Rechtsaussage (Entscheidung 6 zieht dort die Grenze)', () => {
    // Nur Guidelines — ToS und Datenschutz je Community erst nach der
    // Rechtsklärung. Ein Satz über Haftung oder Vertragsbedingungen wäre genau
    // die Grenzüberschreitung, die diese Entscheidung vermeidet.
    const forbidden = [
      /haftung/i, /gewährleistung/i, /nutzungsbedingungen/i, /vertrag/i, /datenschutzerklärung/i,
      /liability/i, /warrant/i, /terms of service/i, /privacy policy/i,
    ]
    for (const locale of LOCALES) {
      for (const pattern of forbidden) {
        expect(guidelinesTemplate(locale).body).not.toMatch(pattern)
      }
    }
  })

  it('geht durch den Markdown-Parser, den die Seite wirklich rendert', () => {
    // MarkdownContent kennt nur ein Subset. Eine Vorlage, die es verlässt,
    // stünde als roher Text auf der Seite.
    for (const locale of LOCALES) {
      expect(() => parseMarkdown(guidelinesTemplate(locale).body)).not.toThrow()
      expect(parseMarkdown(guidelinesTemplate(locale).body).length).toBeGreaterThan(0)
    }
  })

  it('erfüllt das Schema, mit dem der Owner sie später speichert', () => {
    // Sonst könnte man die geseedete Seite öffnen, nichts ändern — und nicht
    // mehr speichern.
    for (const locale of LOCALES) {
      const template = guidelinesTemplate(locale)
      expect(() => schema.parse({
        slug: template.slug,
        locale,
        title: template.title,
        body: template.body,
        status: 'published',
        sortOrder: template.sortOrder,
      })).not.toThrow()
    }
  })

  it('hat in beiden Sprachen einen eigenen Text (keine vergessene Kopie)', () => {
    expect(guidelinesTemplate('de').body).not.toBe(guidelinesTemplate('en').body)
    expect(guidelinesTemplate('de').title).not.toBe(guidelinesTemplate('en').title)
  })
})
