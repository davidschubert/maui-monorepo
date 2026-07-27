import { describe, expect, it } from 'vitest'
import { isSafeHref, parseInline, parseMarkdown } from '../shared/markdown'

describe('parseInline', () => {
  it('parst fett/kursiv/code', () => {
    expect(parseInline('a **b** *c* `d`')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'strong', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'c' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'd' },
    ])
  })

  it('verlinkt nur sichere Ziele', () => {
    expect(parseInline('[ok](https://example.com)')).toEqual([
      { type: 'link', href: 'https://example.com', children: [{ type: 'text', text: 'ok' }] },
    ])
    expect(parseInline('[intern](/dashboard)')).toEqual([
      { type: 'link', href: '/dashboard', children: [{ type: 'text', text: 'intern' }] },
    ])
    // javascript:/data:/protokoll-relativ → nur der Linktext, KEIN Link
    // (die URL endet am ersten ')' — der Rest bleibt als Text stehen)
    expect(parseInline('[xss](javascript:alert(1))')).toEqual([
      { type: 'text', text: 'xss' },
      { type: 'text', text: ')' },
    ])
    expect(parseInline('[xss](data:text/html,x)')).toEqual([{ type: 'text', text: 'xss' }])
    expect(parseInline('[xss](//evil.com)')).toEqual([{ type: 'text', text: 'xss' }])
  })

  it('lässt Raw-HTML als Text durch (Vue escaped beim Rendern)', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([
      { type: 'text', text: '<script>alert(1)</script>' },
    ])
  })

  it('unvollständige Syntax degradiert zu Text', () => {
    expect(parseInline('2 * 3 und a*b')).toEqual([
      { type: 'text', text: '2 ' },
      { type: 'em', children: [{ type: 'text', text: ' 3 und a' }] },
      { type: 'text', text: 'b' },
    ])
    expect(parseInline('**offen')).toEqual([{ type: 'text', text: '**offen' }])
  })
})

describe('parseInline Unterstrich-Betonung (K6)', () => {
  it('_kursiv_ → em (wie *kursiv*)', () => {
    expect(parseInline('_kursiv_')).toEqual([
      { type: 'em', children: [{ type: 'text', text: 'kursiv' }] },
    ])
    // der sichtbare Audit-Befund von demo.pukalani.app/ueber-mich
    expect(parseInline('_The fastest way to reach me is a post in the feed._')).toEqual([
      { type: 'em', children: [{ type: 'text', text: 'The fastest way to reach me is a post in the feed.' }] },
    ])
  })

  it('__fett__ → strong (doppelt gewinnt vor einfach, wie **fett**)', () => {
    expect(parseInline('__fett__')).toEqual([
      { type: 'strong', children: [{ type: 'text', text: 'fett' }] },
    ])
  })

  it('mischt sich mit der Stern-Variante und verschachtelt gleich', () => {
    expect(parseInline('a *b* und __c__')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'em', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' und ' },
      { type: 'strong', children: [{ type: 'text', text: 'c' }] },
    ])
    expect(parseInline('__fett *kursiv*__')).toEqual([
      { type: 'strong', children: [
        { type: 'text', text: 'fett ' },
        { type: 'em', children: [{ type: 'text', text: 'kursiv' }] },
      ] },
    ])
    expect(parseInline('_kursiv **fett**_')).toEqual([
      { type: 'em', children: [
        { type: 'text', text: 'kursiv ' },
        { type: 'strong', children: [{ type: 'text', text: 'fett' }] },
      ] },
    ])
  })

  it('betont NICHT innerhalb eines Wortes (snake_case bleibt Text)', () => {
    expect(parseInline('snake_case_wort')).toEqual([{ type: 'text', text: 'snake_case_wort' }])
    expect(parseInline('MY_ENV_VAR und foo__bar__baz')).toEqual([
      { type: 'text', text: 'MY_ENV_VAR und foo__bar__baz' },
    ])
    // Flanke nur einseitig frei genügt nicht (rechts klebt ein Wortzeichen)
    expect(parseInline('_a_b')).toEqual([{ type: 'text', text: '_a_b' }])
    // Unicode: „ß" ist ein Buchstabe, also auch eine Wortflanke
    expect(parseInline('Straße_x_')).toEqual([{ type: 'text', text: 'Straße_x_' }])
    // Zahlen ebenso (2_3_4 ist keine Betonung)
    expect(parseInline('2_3_4')).toEqual([{ type: 'text', text: '2_3_4' }])
  })

  it('unvollständige Syntax degradiert zu Text (wie *)', () => {
    expect(parseInline('_offen')).toEqual([{ type: 'text', text: '_offen' }])
    expect(parseInline('__offen')).toEqual([{ type: 'text', text: '__offen' }])
    expect(parseInline('nur _ ein Unterstrich')).toEqual([{ type: 'text', text: 'nur _ ein Unterstrich' }])
  })

  it('greift im Link-Text', () => {
    expect(parseInline('[_kursiv_](https://example.com)')).toEqual([
      { type: 'link', href: 'https://example.com', children: [
        { type: 'em', children: [{ type: 'text', text: 'kursiv' }] },
      ] },
    ])
    expect(parseInline('[__fett__](/dashboard)')).toEqual([
      { type: 'link', href: '/dashboard', children: [
        { type: 'strong', children: [{ type: 'text', text: 'fett' }] },
      ] },
    ])
    // Ziele mit Unterstrich bleiben unangetastet — der Href ist keine Betonung
    expect(parseInline('[x](/a_b_c)')).toEqual([
      { type: 'link', href: '/a_b_c', children: [{ type: 'text', text: 'x' }] },
    ])
  })

  it('funktioniert in allen Block-Typen (parseMarkdown reicht durch)', () => {
    expect(parseMarkdown('- _a_')).toEqual([
      { type: 'list', ordered: false, items: [[{ type: 'em', children: [{ type: 'text', text: 'a' }] }]] },
    ])
    expect(parseMarkdown('## __Kopf__')[0]).toEqual({
      type: 'heading',
      level: 2,
      children: [{ type: 'strong', children: [{ type: 'text', text: 'Kopf' }] }],
    })
  })
})

describe('parseMarkdown', () => {
  it('trennt Absätze an Leerzeilen', () => {
    const blocks = parseMarkdown('eins\n\nzwei')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({ type: 'paragraph', children: [{ type: 'text', text: 'eins' }] })
  })

  it('parst Listen (ungeordnet + geordnet)', () => {
    expect(parseMarkdown('- a\n- b')).toEqual([
      { type: 'list', ordered: false, items: [[{ type: 'text', text: 'a' }], [{ type: 'text', text: 'b' }]] },
    ])
    expect(parseMarkdown('1. a\n2. b')[0]).toMatchObject({ type: 'list', ordered: true })
  })

  it('parst Zitate und Codeblöcke', () => {
    expect(parseMarkdown('> zitat')).toEqual([
      { type: 'quote', children: [{ type: 'text', text: 'zitat' }] },
    ])
    expect(parseMarkdown('```\ncode <b>raw</b>\n```')).toEqual([
      { type: 'codeblock', text: 'code <b>raw</b>' },
    ])
  })

  it('unbeendeter Codeblock läuft bis zum Ende (kein Absturz)', () => {
    expect(parseMarkdown('```\nfoo')).toEqual([{ type: 'codeblock', text: 'foo' }])
  })

  it('mehrzeilige Absätze behalten die Zeilen (pre-line im Renderer)', () => {
    expect(parseMarkdown('a\nb')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: 'a\nb' }] },
    ])
  })
})

describe('isSafeHref', () => {
  it.each(['https://a.de', 'http://a.de/x?y=1', '/pfad', '/'])('erlaubt %s', (href) => {
    expect(isSafeHref(href)).toBe(true)
  })
  it.each(['javascript:alert(1)', 'data:text/html,x', '//evil', '/\\evil', 'ftp://x', 'mailto:a@b.de', '/%2F%2Fevil'])('blockt %s', (href) => {
    expect(isSafeHref(href)).toBe(false)
  })
})

describe('parseMarkdown Überschriften', () => {
  it('## → heading level 2, ### → level 3', () => {
    const blocks = parseMarkdown('## Abschnitt\n\n### Unterabschnitt')
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 2 })
    expect(blocks[1]).toMatchObject({ type: 'heading', level: 3 })
  })
  it('# zählt als level 2 (die Seiten-Überschrift ist separat)', () => {
    expect(parseMarkdown('# Titel')[0]).toMatchObject({ type: 'heading', level: 2 })
  })
  it('trennt Überschrift von folgendem Absatz', () => {
    const blocks = parseMarkdown('## Kopf\nText danach')
    expect(blocks[0]!.type).toBe('heading')
    expect(blocks[1]!.type).toBe('paragraph')
  })
})
