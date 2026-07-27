import { describe, expect, it } from 'vitest'
import { PAGE_EXCERPT_MAX_LENGTH, pageExcerpt } from '../shared/pageExcerpt'

describe('pageExcerpt', () => {
  it('nimmt den ersten Textabsatz', () => {
    const body = 'Erster Absatz mit Inhalt.\n\nZweiter Absatz.'
    expect(pageExcerpt(body)).toBe('Erster Absatz mit Inhalt.')
  })

  it('überspringt Überschriften, Trennlinien und reine Bilder', () => {
    const body = '# Über mich\n\n---\n\n![Logo](/logo.png)\n\nWir sind eine kleine Community.'
    expect(pageExcerpt(body)).toBe('Wir sind eine kleine Community.')
  })

  it('strippt Markdown-Syntax (Betonung, Links, Inline-Code, Zitat, Liste)', () => {
    const body = '> **Hallo** und _willkommen_ bei [uns](https://example.com) — `code` inklusive.'
    expect(pageExcerpt(body)).toBe('Hallo und willkommen bei uns — code inklusive.')
  })

  it('strippt HTML-Inseln und Kommentare', () => {
    const body = '<!-- Notiz --><p>Ein <em>Satz</em> mit HTML.</p>'
    expect(pageExcerpt(body)).toBe('Ein Satz mit HTML.')
  })

  it('überspringt Code-Zäune samt Inhalt', () => {
    const body = '```js\nconst x = "kein Beschreibungstext"\n```\n\nDanach kommt der Text.'
    expect(pageExcerpt(body)).toBe('Danach kommt der Text.')
  })

  it('verschluckt bei unabgeschlossenem Zaun nicht den Rest', () => {
    // Abgeschnittener Body: die Zaunzeile fällt, der Text danach bleibt
    expect(pageExcerpt('```\n\nDer Text bleibt sichtbar.')).toBe('Der Text bleibt sichtbar.')
    expect(pageExcerpt('```\nDirekt danach.')).toBe('Direkt danach.')
  })

  it('kürzt an der Wortgrenze mit Auslassungszeichen', () => {
    const body = `${'Wort '.repeat(60)}Ende.`
    const result = pageExcerpt(body)
    expect(result.length).toBeLessThanOrEqual(PAGE_EXCERPT_MAX_LENGTH)
    expect(result.endsWith('…')).toBe(true)
    expect(result).not.toMatch(/ …$/)
  })

  it('kürzt nicht, wenn der Absatz kurz genug ist', () => {
    expect(pageExcerpt('Kurz.')).toBe('Kurz.')
  })

  it('respektiert eine eigene Maximallänge', () => {
    expect(pageExcerpt('Ein etwas längerer Satz für den Test.', 20).length).toBeLessThanOrEqual(20)
  })

  it('liefert leeren String für leeren oder syntaxleeren Body', () => {
    expect(pageExcerpt('')).toBe('')
    expect(pageExcerpt('# Nur eine Überschrift')).toBe('')
    expect(pageExcerpt('   \n\n  ')).toBe('')
  })

  it('macht aus mehrzeiligen Absätzen eine Zeile', () => {
    expect(pageExcerpt('Zeile eins\nZeile zwei')).toBe('Zeile eins Zeile zwei')
  })
})
