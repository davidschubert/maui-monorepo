/**
 * Wächter für Audit-Befund S7: die Rechtsseiten-Vorlagen müssen als VORLAGE
 * erkennbar bleiben und durch den Markdown-Parser des Core gehen, den die
 * Seiten wirklich rendern (MarkdownContent kennt nur ein Subset).
 *
 * Die Tests prüfen bewusst Eigenschaften, nicht Wortlaut: der Text darf
 * jederzeit besser werden, aber nie den Hinweis, die Marker oder die
 * Parsebarkeit verlieren.
 */
import { describe, expect, it } from 'vitest'
import { LEGAL_TEMPLATE_MARKERS, LEGAL_TEMPLATE_SLUGS, legalTemplateLocale, legalTemplates } from '../shared/legalTemplates'
import { createPageUpsertSchema } from '../schemas/page'
import { parseMarkdown } from '../../core/shared/markdown'

const schema = createPageUpsertSchema()

describe('Rechtsseiten-Vorlagen (Befund S7)', () => {
  it('kennt genau imprint + privacy, in Navigations-Reihenfolge hinten', () => {
    for (const locale of ['de', 'en']) {
      const templates = legalTemplates(locale)
      expect(templates.map(t => t.slug)).toEqual([...LEGAL_TEMPLATE_SLUGS])
      expect(templates.every(t => t.sortOrder >= 90)).toBe(true)
    }
  })

  it('fällt für unbekannte Sprachen auf Englisch zurück (nie leer)', () => {
    expect(legalTemplateLocale('de-AT')).toBe('de')
    expect(legalTemplateLocale('fr')).toBe('en')
    expect(legalTemplateLocale(null)).toBe('en')
    expect(legalTemplates('fr')).toEqual(legalTemplates('en'))
  })

  it('trägt den Vorlagen-Hinweis am Anfang', () => {
    for (const template of legalTemplates('de')) expect(template.body.startsWith('> **Vorlage —')).toBe(true)
    for (const template of legalTemplates('en')) expect(template.body.startsWith('> **Template —')).toBe(true)
  })

  it('sagt, dass sie keine Rechtsberatung ist', () => {
    for (const template of legalTemplates('de')) expect(template.body).toContain('ersetzt keine Rechtsberatung')
    for (const template of legalTemplates('en')) expect(template.body).toContain('not legal advice')
  })

  it('markiert jede offene Stelle unübersehbar', () => {
    for (const locale of ['de', 'en'] as const) {
      for (const template of legalTemplates(locale)) {
        const marker = LEGAL_TEMPLATE_MARKERS[locale]
        expect(template.body.split(marker).length - 1).toBeGreaterThanOrEqual(5)
        // Marker dürfen NIE zu Links werden ([text](href) ist die Link-Form)
        expect(template.body).not.toMatch(/\[(?:AUSFÜLLEN|FILL IN):[^\]]*\]\(/)
      }
    }
  })

  it('nennt Hosting/Auftragsverarbeitung als Platzhalter, nicht als Zusicherung', () => {
    const de = legalTemplates('de').find(t => t.slug === 'privacy')!
    expect(de.body).toContain('Pukalani')
    expect(de.body).toContain('Art. 28 DSGVO')
    // Die AVV-Aussage steht IM Marker — sie ist eine Aufgabe, keine Behauptung.
    expect(de.body).toMatch(/\[AUSFÜLLEN: bestätigen, dass mit den genannten Stellen Verträge zur Auftragsverarbeitung/)
  })

  it('führt die Betroffenenrechte auf', () => {
    const de = legalTemplates('de').find(t => t.slug === 'privacy')!
    for (const article of ['Art. 15', 'Art. 16', 'Art. 17', 'Art. 18', 'Art. 20', 'Art. 21', 'Art. 77']) {
      expect(de.body).toContain(article)
    }
    const en = legalTemplates('en').find(t => t.slug === 'privacy')!
    for (const article of ['Art. 15', 'Art. 17', 'Art. 20', 'Art. 77']) expect(en.body).toContain(article)
  })

  it('ist als Seite gültig (dasselbe Schema wie der Editor) und ein Entwurf', () => {
    for (const locale of ['de', 'en'] as const) {
      for (const template of legalTemplates(locale)) {
        const parsed = schema.safeParse({
          slug: template.slug,
          locale,
          title: template.title,
          body: template.body,
          status: 'draft',
          sortOrder: template.sortOrder,
        })
        expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
      }
    }
  })

  it('nutzt nur Markdown, das MarkdownContent auch rendert', () => {
    for (const locale of ['de', 'en'] as const) {
      for (const template of legalTemplates(locale)) {
        const blocks = parseMarkdown(template.body)
        expect(blocks.length).toBeGreaterThan(5)
        expect(blocks[0]!.type).toBe('quote')
        // Keine Konstrukte ohne Renderer (horizontale Linien, Tabellen) —
        // die würden als nackter Text im Rechtstext landen.
        expect(template.body).not.toMatch(/^\s*(---|\|)/m)
        // Überschriften nur h2/h3: tiefer kann der Parser nicht abbilden.
        expect(template.body).not.toMatch(/^#{4,}\s/m)
      }
    }
  })
})
