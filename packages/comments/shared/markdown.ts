/**
 * Sicherer Markdown-SUBSET-Parser für Kommentar-Content (user-generiert!).
 *
 * Bewusst NICHT MDC/remark: MDC ist für vertrauenswürdigen Admin-Content
 * (Changelog) gedacht — seine Component-Syntax (::block, Inline-Bindings) darf
 * nie auf Fremd-Input laufen. Dieser Parser erzeugt einen kleinen AST, den
 * CommentMarkdown.vue über h()-vnodes rendert — es gibt KEINEN v-html-Pfad,
 * Raw-HTML bleibt Text (Vue escaped), unbekannte Syntax degradiert zu Text.
 *
 * Unterstützt: **fett**, *kursiv*, `code`, [Text](URL) (nur https?:// oder
 * interner /-Pfad), Absätze, - / 1. Listen, > Zitate, ```Codeblöcke```.
 */

export type InlineNode
  = | { type: 'text', text: string }
    | { type: 'strong', children: InlineNode[] }
    | { type: 'em', children: InlineNode[] }
    | { type: 'code', text: string }
    | { type: 'link', href: string, children: InlineNode[] }

export type BlockNode
  = | { type: 'paragraph', children: InlineNode[] }
    | { type: 'list', ordered: boolean, items: InlineNode[][] }
    | { type: 'quote', children: InlineNode[] }
    | { type: 'codeblock', text: string }

/** Nur harmlose Link-Ziele: absolute https?-URLs oder interne Pfade. */
export function isSafeHref(href: string): boolean {
  return /^https?:\/\/\S+$/.test(href) || /^\/(?![/\\%])[^\s\\]*$/.test(href)
}

const INLINE_RE = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/

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
      && !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i]!)) {
      buf.push(lines[i]!)
      i++
    }
    blocks.push({ type: 'paragraph', children: parseInline(buf.join('\n')) })
  }

  return blocks
}
