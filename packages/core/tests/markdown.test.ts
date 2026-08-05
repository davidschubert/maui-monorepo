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

/**
 * CommonMark: Backslash-Escapes und HTML-Entities (2026-08-04).
 * Anlass ist der Serialisierer von `@tiptap/markdown`, der jeden Text-Knoten
 * hartkodiert maskiert — ohne diese Regel zeigte der Beitrag die Backslashes
 * (Messung: docs/plans/COMPOSER-UEDITOR.md).
 */
describe('Backslash-Escapes', () => {
  it('nimmt dem Marker die Wirkung und zeigt das Zeichen', () => {
    expect(parseInline('\\*kein Stern\\*')).toEqual([{ type: 'text', text: '*kein Stern*' }])
    expect(parseInline('snake\\_case')).toEqual([{ type: 'text', text: 'snake_case' }])
    expect(parseInline('Platzhalter \\[Name\\]')).toEqual([{ type: 'text', text: 'Platzhalter [Name]' }])
    expect(parseInline('2 \\* 3 \\* 4')).toEqual([{ type: 'text', text: '2 * 3 * 4' }])
  })

  it('escapt den Backslash selbst', () => {
    expect(parseInline('C:\\\\Users\\\\test')).toEqual([{ type: 'text', text: 'C:\\Users\\test' }])
  })

  it('lässt einen Backslash vor NICHT-Interpunktion stehen (CommonMark)', () => {
    // Der Windows-Pfad, wie ein Mensch ihn in eine Textarea tippt.
    expect(parseInline('Pfad C:\\Users\\test')).toEqual([{ type: 'text', text: 'Pfad C:\\Users\\test' }])
  })

  it('greift auch vor der Block-Erkennung', () => {
    expect(parseMarkdown('\\# kein Kopf')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: '# kein Kopf' }] },
    ])
    expect(parseMarkdown('\\- keine Liste')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: '- keine Liste' }] },
    ])
    expect(parseMarkdown('\\> kein Zitat')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: '> kein Zitat' }] },
    ])
  })

  it('wirkt NICHT in Code — dort maskiert auch der Serialisierer nicht', () => {
    expect(parseInline('`a\\*b`')).toEqual([{ type: 'code', text: 'a\\*b' }])
    expect(parseMarkdown('```\na\\*b\n```')).toEqual([{ type: 'codeblock', text: 'a\\*b' }])
  })

  it('betont weiterhin, wo NICHT escapt wurde', () => {
    expect(parseInline('\\*roh\\* und *kursiv*')).toEqual([
      { type: 'text', text: '*roh* und ' },
      { type: 'em', children: [{ type: 'text', text: 'kursiv' }] },
    ])
  })
})

describe('HTML-Entities', () => {
  it('dekodiert benannte und numerische Entities im TEXT-Knoten', () => {
    expect(parseInline('a &lt; b &gt; c &amp; d')).toEqual([{ type: 'text', text: 'a < b > c & d' }])
    expect(parseInline('&quot;x&quot; und &#39;y&#39; und &#x27;z&#x27;')).toEqual([
      { type: 'text', text: '"x" und \'y\' und \'z\'' },
    ])
  })

  it('lässt unbekannte Namen stehen, statt zu raten', () => {
    expect(parseInline('&copy; 2026 &foo;')).toEqual([{ type: 'text', text: '&copy; 2026 &foo;' }])
  })

  it('dekodiert genau EINMAL (&amp;lt; bleibt sichtbar &lt;)', () => {
    expect(parseInline('&amp;lt;')).toEqual([{ type: 'text', text: '&lt;' }])
  })

  it('ein escaptes &amp; bleibt der literale Text', () => {
    expect(parseInline('\\&amp;')).toEqual([{ type: 'text', text: '&amp;' }])
  })

  it('wirkt NICHT in Code', () => {
    expect(parseInline('`&lt;b&gt;`')).toEqual([{ type: 'code', text: '&lt;b&gt;' }])
    expect(parseMarkdown('```\n&lt;b&gt;\n```')).toEqual([{ type: 'codeblock', text: '&lt;b&gt;' }])
  })

  it('ersetzt verbotene Codepoints durch U+FFFD', () => {
    expect(parseInline('&#0;')).toEqual([{ type: 'text', text: '\uFFFD' }])
    expect(parseInline('&#xD800;')).toEqual([{ type: 'text', text: '\uFFFD' }])
    expect(parseInline('&#x110000;')).toEqual([{ type: 'text', text: '\uFFFD' }])
  })
})

/**
 * DIE SICHERHEITSGRENZE. Eine dekodierte Entity darf NIE zu einem Element
 * werden — der AST kennt dafür gar keinen Knoten, und der Renderer setzt
 * `node.text` als vnode-TEXTKIND (MarkdownContent.vue, default-Zweig).
 */
describe('Entities kippen die Sicherheitsgrenze nicht', () => {
  it('&lt;script&gt; wird EIN Text-Knoten, kein Element', () => {
    const blocks = parseMarkdown('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(blocks).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: '<script>alert(1)</script>' }] },
    ])
  })

  it('Vue escapt genau diesen Text wieder (renderToString auf dem echten Wert)', async () => {
    const { h } = await import('vue')
    const { renderToString } = await import('vue/server-renderer')
    const block = parseMarkdown('&lt;img src=x onerror=alert(1)&gt;')[0]!
    const text = (block as { children: Array<{ text: string }> }).children[0]!.text
    expect(text).toBe('<img src=x onerror=alert(1)>')
    // So rendert MarkdownContent: das Text-Blatt ist ein Kind-STRING.
    await expect(renderToString(h('p', text))).resolves
      .toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>')
  })

  it('ein per Entity zusammengesetztes Link-Ziel wird NICHT verlinkt', () => {
    // isSafeHref prüft NACH dem Dekodieren — sonst käme javascript: durch.
    // Das Ziel-Regex endet an der ersten `)` — die zweite bleibt Text (wie bei
    // `javascript:` ohne Entity, siehe oben). Entscheidend: KEIN link-Knoten.
    expect(parseInline('[x](javascript&#58;alert(1))')).toEqual([
      { type: 'text', text: 'x' },
      { type: 'text', text: ')' },
    ])
    expect(parseInline('[x](&#47;&#47;evil.com)')).toEqual([{ type: 'text', text: 'x' }])
  })

  it('dekodiert das Ziel eines sicheren Links', () => {
    expect(parseInline('[x](https://e.de/a&amp;b)')).toEqual([
      { type: 'link', href: 'https://e.de/a&b', children: [{ type: 'text', text: 'x' }] },
    ])
  })

  it('rohe Zeichen der privaten Unicode-Zone kommen nicht an die Maskierung heran', () => {
    // U+E000 ist intern das Ersatzzeichen für `\!` — als Eingabe wird es entfernt.
    expect(parseInline('a\uE000b')).toEqual([{ type: 'text', text: 'ab' }])
    // …und über eine numerische Entity ist es ebenfalls nicht erreichbar.
    expect(parseInline('&#xE000;')).toEqual([{ type: 'text', text: '\uFFFD' }])
  })
})

describe('Escape-Tabelle', () => {
  // Nagelt die interne Maskierung fest: käme ein Zeichen dazu, ohne dass der
  // reservierte Unicode-Bereich mitwächst, bliebe hier ein Ersatzzeichen aus
  // der privaten Zone im Text stehen — sichtbar als kaputtes Kästchen.
  const escapable = [...'!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~']

  it.each(escapable)('\\%s ergibt genau dieses Zeichen', (ch) => {
    expect(parseInline(`a\\${ch}b`)).toEqual([{ type: 'text', text: `a${ch}b` }])
  })

  it('lässt kein Zeichen der privaten Zone durch', () => {
    const all = escapable.map(ch => `\\${ch}`).join('')
    const [node] = parseInline(all) as Array<{ type: 'text', text: string }>
    expect(node!.text).toBe(escapable.join(''))
    expect(/[\uE000-\uE01F]/.test(node!.text)).toBe(false)
  })
})
