/**
 * Wächter für den Regeln-RÜCKFALL (F1, kleines Paket nach Stufe 4 — Davids
 * Entscheidung 2).
 *
 * Geprüft wird das FORMEN der Antwort, nicht die Datenbank-Frage davor: ob es
 * die Zeile gibt, beantwortet `server/utils/guidelinesPresence.ts` an der
 * Datentür, und das ist ohne laufende Instanz nicht ehrlich testbar. Hier
 * steht dafür die Eigenschaft, die man beim Nachrüsten am leichtesten kaputt
 * macht — dass die Vorlage genau so aussieht wie eine gespeicherte Seite. Ein
 * Feld zu wenig, und der Editor öffnet sich leer; ein Feld zu viel, und der
 * Besucher sieht einen erfundenen Zeitstempel.
 */
import { describe, expect, it } from 'vitest'
import {
  GUIDELINES_TEMPLATE_LOCALES,
  guidelinesFallbackEditorRows,
  guidelinesFallbackGroup,
  guidelinesFallbackNavItem,
  guidelinesFallbackPage,
} from '../shared/guidelinesFallback'
import { GUIDELINES_SORT_ORDER, guidelinesTemplate } from '../shared/guidelinesTemplate'
import { GUIDELINES_SLUG } from '../shared/types/page'
import { createPageUpsertSchema } from '../schemas/page'

const schema = createPageUpsertSchema()

describe('Regeln-Rückfall — die öffentliche Seite', () => {
  it('liefert den Text in der angefragten Sprache', () => {
    expect(guidelinesFallbackPage('de').body).toBe(guidelinesTemplate('de').body)
    expect(guidelinesFallbackPage('en').body).toBe(guidelinesTemplate('en').body)
  })

  it('folgt dem Sprach-Rückfall der Vorlage statt leer zu bleiben', () => {
    // 'de-AT' ⇒ de, alles Unbekannte ⇒ en. Ein Besucher darf nie vor einer
    // leeren Regel-Seite stehen, nur weil seine Locale ein Suffix trägt.
    expect(guidelinesFallbackPage('de-AT').locale).toBe('de')
    expect(guidelinesFallbackPage('fr').locale).toBe('en')
    expect(guidelinesFallbackPage(null).body.length).toBeGreaterThan(0)
  })

  it('erfindet keinen Bearbeitungs-Zeitpunkt', () => {
    // Es hat nie jemand bearbeitet. Ein Datum hier wäre eine Behauptung über
    // eine Zeile, die es nicht gibt.
    expect(guidelinesFallbackPage('de').updatedAt).toBe('')
  })

  it('trägt dieselbe Adresse wie die gespeicherte Seite', () => {
    expect(guidelinesFallbackPage('de').slug).toBe(GUIDELINES_SLUG)
    expect(guidelinesFallbackNavItem('de').slug).toBe(GUIDELINES_SLUG)
  })
})

describe('Regeln-Rückfall — der Navigationspunkt', () => {
  it('steht an derselben Stelle wie die gespeicherte Seite', () => {
    // Sonst spränge „Regeln" beim ersten Speichern durch die Navigation.
    expect(guidelinesFallbackNavItem('de').sortOrder).toBe(GUIDELINES_SORT_ORDER)
    expect(guidelinesFallbackNavItem('de').title).toBe(guidelinesTemplate('de').title)
    expect(guidelinesFallbackNavItem('en').title).toBe(guidelinesTemplate('en').title)
  })
})

describe('Regeln-Rückfall — das Dashboard', () => {
  it('markiert den Listen-Eintrag als Vorlage und lässt die Id leer', () => {
    const group = guidelinesFallbackGroup()
    expect(group.isTemplate).toBe(true)
    expect(group.slug).toBe(GUIDELINES_SLUG)
    // Eine erfundene Id sähe aus wie eine Zeile, die man löschen könnte.
    for (const locale of group.locales) expect(locale.$id).toBe('')
  })

  it('zeigt in der Liste dieselben Sprachen, die der Editor vorfüllt', () => {
    const group = guidelinesFallbackGroup()
    const rows = guidelinesFallbackEditorRows()
    expect(group.locales.map(l => l.locale)).toEqual([...GUIDELINES_TEMPLATE_LOCALES])
    expect(rows.map(r => r.locale)).toEqual([...GUIDELINES_TEMPLATE_LOCALES])
  })

  it('füllt beide Sprachen mit ihrem EIGENEN Text (keine vergessene Kopie)', () => {
    const [en, de] = guidelinesFallbackEditorRows()
    expect(en!.body).toBe(guidelinesTemplate('en').body)
    expect(de!.body).toBe(guidelinesTemplate('de').body)
    expect(en!.body).not.toBe(de!.body)
  })

  it('lässt sich unverändert speichern — das ist der ganze Zweck', () => {
    // Der Owner schlägt die Vorlage auf und drückt Speichern: was der Editor
    // dann abschickt, MUSS durch dasselbe Schema gehen wie jede andere Seite.
    for (const row of guidelinesFallbackEditorRows()) {
      expect(() => schema.parse({
        slug: GUIDELINES_SLUG,
        locale: row.locale,
        title: row.title,
        body: row.body,
        status: row.status,
        sortOrder: row.sortOrder,
      })).not.toThrow()
    }
  })

  it('kommt veröffentlicht an — Regeln, die niemand sehen kann, sind keine', () => {
    for (const row of guidelinesFallbackEditorRows()) expect(row.status).toBe('published')
    for (const locale of guidelinesFallbackGroup().locales) expect(locale.status).toBe('published')
  })
})
