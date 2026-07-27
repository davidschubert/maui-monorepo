/**
 * Sicherer Markdown-SUBSET-Parser für USER-GENERIERTEN Content — Core-Utility
 * (seit Phase 25 hier statt in comments; Konsumenten: comments, posts).
 *
 * Bewusst NICHT MDC/remark: MDC ist für vertrauenswürdigen Admin-Content
 * (Changelog) gedacht — seine Component-Syntax (::block, Inline-Bindings) darf
 * nie auf Fremd-Input laufen. Dieser Parser erzeugt einen kleinen AST, den
 * MarkdownContent.vue über h()-vnodes rendert — es gibt KEINEN v-html-Pfad,
 * Raw-HTML bleibt Text (Vue escaped), unbekannte Syntax degradiert zu Text.
 *
 * Unterstützt: **fett**, __fett__, *kursiv*, _kursiv_, `code`, [Text](URL)
 * (nur https?:// oder interner /-Pfad), Absätze, - / 1. Listen, > Zitate,
 * ```Codeblöcke```.
 */

export type InlineNode
  = | { type: 'text', text: string }
    | { type: 'strong', children: InlineNode[] }
    | { type: 'em', children: InlineNode[] }
    | { type: 'code', text: string }
    | { type: 'link', href: string, children: InlineNode[] }

export type BlockNode
  = | { type: 'paragraph', children: InlineNode[] }
    | { type: 'heading', level: 2 | 3, children: InlineNode[] }
    | { type: 'list', ordered: boolean, items: InlineNode[][] }
    | { type: 'quote', children: InlineNode[] }
    | { type: 'codeblock', text: string }

/** Nur harmlose Link-Ziele: absolute https?-URLs oder interne Pfade. */
export function isSafeHref(href: string): boolean {
  return /^https?:\/\/\S+$/.test(href) || /^\/(?![/\\%])[^\s\\]*$/.test(href)
}

/**
 * Betonung mit Unterstrich (`_kursiv_`, `__fett__`) folgt GENAU den Regeln der
 * Stern-Variante — gleiche Reihenfolge (doppelt vor einfach), gleicher
 * Inhalts-Filter (`[^_]+`, also keine Verschachtelung derselben Marke),
 * gleiche Rekursion, unvollständige Syntax bleibt Text.
 *
 * EINE bewusste Abweichung (die einzige, die `_` von `*` unterscheidet):
 * Unterstriche betonen NICHT innerhalb eines Wortes. Ohne diese Klemme würde
 * `snake_case_wort` zu „snake<em>case</em>wort" — Unterstriche stecken in
 * Bezeichnern/Dateinamen, Sterne nicht. Umgesetzt als Flanken-Check auf BEIDEN
 * Seiten: links/rechts darf kein Buchstabe, keine Zahl und kein weiterer
 * Unterstrich stehen (`(?<![\p{L}\p{N}_])` … `(?![\p{L}\p{N}_])`).
 * Unicode-fähig (`u`), damit „Straße_x_" genauso geschützt ist wie „foo_x_";
 * das mitgeklemmte `_` verhindert zusätzlich, dass `foo__bar__baz` über den
 * inneren Unterstrich doch noch als `_bar_` durchrutscht.
 * Folge (bewusst): dicht gepackte Unterstrich-Läufe wie `_a__b_` finden kein
 * Paar und bleiben Text — dieselbe „unbekannte Syntax degradiert zu Text"-
 * Regel wie bei `**offen`.
 * Gruppen: 10/11 = __fett__, 12/13 = _kursiv_.
 */
const INLINE_RE = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|((?<![\p{L}\p{N}_])__([^_]+)__(?![\p{L}\p{N}_]))|((?<![\p{L}\p{N}_])_([^_]+)_(?![\p{L}\p{N}_]))/u

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let rest = text
  while (rest.length > 0) {
    const match = INLINE_RE.exec(rest)
    if (!match) {
      nodes.push({ type: 'text', text: rest })
      break
    }
    if (match.index > 0) nodes.push({ type: 'text', text: rest.slice(0, match.index) })
    if (match[2] !== undefined) nodes.push({ type: 'strong', children: parseInline(match[2]) })
    else if (match[4] !== undefined) nodes.push({ type: 'em', children: parseInline(match[4]) })
    else if (match[6] !== undefined) nodes.push({ type: 'code', text: match[6] })
    else if (match[11] !== undefined) nodes.push({ type: 'strong', children: parseInline(match[11]) })
    else if (match[13] !== undefined) nodes.push({ type: 'em', children: parseInline(match[13]) })
    else if (match[8] !== undefined && match[9] !== undefined) {
      // Unsichere Ziele (javascript:, data:, //evil) NICHT verlinken — nur Text
      if (isSafeHref(match[9])) nodes.push({ type: 'link', href: match[9], children: parseInline(match[8]) })
      else nodes.push({ type: 'text', text: match[8] })
    }
    rest = rest.slice(match.index + match[0].length)
  }
  return nodes
}

export function parseMarkdown(source: string): BlockNode[] {
  const blocks: BlockNode[] = []
  const lines = source.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    if (line.trim() === '') { i++; continue }

    // ``` Codeblock (bis zum schließenden ``` oder Ende)
    if (line.trimStart().startsWith('```')) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i]!.trimStart().startsWith('```')) {
        buf.push(lines[i]!)
        i++
      }
      i++ // schließendes ``` (oder Ende)
      blocks.push({ type: 'codeblock', text: buf.join('\n') })
      continue
    }

    // Überschrift (##/###) — die Seiten-Überschrift (h1) ist separat, daher h2/h3
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line.trimStart())
    if (headingMatch) {
      const level = headingMatch[1]!.length <= 2 ? 2 : 3
      blocks.push({ type: 'heading', level, children: parseInline(headingMatch[2]!.trim()) })
      i++
      continue
    }

    // Liste (- oder 1.)
    const listMatch = /^\s*(?:[-*]|\d+\.)\s+/.exec(line)
    if (listMatch) {
      const ordered = /^\s*\d+\./.test(line)
      const items: InlineNode[][] = []
      while (i < lines.length) {
        const m = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(lines[i]!)
        if (!m) break
        items.push(parseInline(m[1]!))
        i++
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    // > Zitat (zusammenhängende >-Zeilen)
    if (line.trimStart().startsWith('>')) {
      const buf: string[] = []
      while (i < lines.length && lines[i]!.trimStart().startsWith('>')) {
        buf.push(lines[i]!.replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push({ type: 'quote', children: parseInline(buf.join('\n')) })
      continue
    }

    // Absatz (zusammenhängende Textzeilen; Zeilenumbrüche bleiben erhalten —
    // whitespace-pre-line im Renderer)
    const buf: string[] = []
    while (i < lines.length && lines[i]!.trim() !== ''
      && !lines[i]!.trimStart().startsWith('```') && !lines[i]!.trimStart().startsWith('>')
      && !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i]!)
      && !/^#{1,6}\s+/.test(lines[i]!.trimStart())) {
      buf.push(lines[i]!)
      i++
    }
    blocks.push({ type: 'paragraph', children: parseInline(buf.join('\n')) })
  }

  return blocks
}
