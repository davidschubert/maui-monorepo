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
