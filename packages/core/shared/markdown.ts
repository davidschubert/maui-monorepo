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
 *
 * BACKSLASH-ESCAPES UND HTML-ENTITIES (seit 2026-08-04): `\*` ist ein
 * literaler Stern und KEIN Betonungs-Marker, `&lt;` ist das Zeichen `<`.
 * Beides ist CommonMark und war hier bis dahin nicht umgesetzt — der Leser sah
 * die Backslashes. Der Anlass ist die geplante Umstellung des Composers auf
 * `UEditor`: `@tiptap/markdown` maskiert beim Serialisieren HARTKODIERT jeden
 * Text-Knoten (`escapeMarkdownSyntax(encodeHtmlEntities(text))`), ohne diese
 * Regel würde aus getipptem `snake_case` gespeichertes `snake\_case` und der
 * Beitrag zeigte den Backslash (Messung: docs/plans/COMPOSER-UEDITOR.md).
 *
 * DIE SICHERHEITSGRENZE ÄNDERT SICH NICHT. Entmaskieren und Dekodieren
 * passieren AUSSCHLIESSLICH im Blatt eines TEXT-Knotens, der Renderer macht
 * daraus weiterhin einen vnode-Textknoten — `&lt;script&gt;` wird also zum
 * sichtbaren Text `<script>` und NIE zu einem Element. Es gibt weiterhin
 * keinen v-html-Pfad. `isSafeHref` gilt unverändert und prüft das Ziel NACH
 * dem Dekodieren, damit `javascript&#58;…` nicht an der Prüfung vorbeikommt.
 *
 * INNERHALB VON CODE wird NICHT entmaskiert (`` `a\*b` `` zeigt den
 * Backslash) — dort maskiert der Serialisierer auch nicht, und CommonMark
 * kennt in Code-Spans/Codeblöcken weder Escapes noch Entities.
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

/*
 * ---------------------------------------------------------------------------
 * Escapes und Entities
 * ---------------------------------------------------------------------------
 *
 * WARUM MASKIEREN STATT „im Regex mitdenken": ein escaptes Zeichen darf zwei
 * Dinge NICHT tun — als Marker wirken (`\*a\*` ist kein Kursiv) und die
 * Block-Erkennung auslösen (`\# kein Kopf`, `\- keine Liste`). Beides hinge an
 * Lookbehinds in JEDEM der sieben Zweige von INLINE_RE und zusätzlich in fünf
 * Block-Prüfungen; ein vergessener Zweig fiele niemandem auf. Stattdessen
 * ersetzt `maskEscapes` jedes `\<Interpunktion>` VOR dem Parsen durch EIN
 * Zeichen aus der privaten Unicode-Zone — danach sieht kein einziger Regex
 * mehr einen Marker, und das Blatt setzt es zurück. Die Zone wird vorher aus
 * der Eingabe entfernt (`stripSentinels`), damit ein Text mit solchen Zeichen
 * nicht an der Maskierung vorbei ein Marker-Zeichen erzeugen kann.
 */

/** Die 32 ASCII-Interpunktionszeichen, die CommonMark escapen lässt. */
const ESCAPABLE = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'
/** Erstes Ersatzzeichen; ESCAPABLE.length Zeichen ab hier sind reserviert. */
const SENTINEL_BASE = 0xE000
/** Muss ESCAPABLE.length Zeichen umfassen — Test `markdown.test.ts` nagelt es fest. */
const SENTINEL_RE = /[\uE000-\uE01F]/g
const ESCAPE_RE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g

function stripSentinels(text: string): string {
  return text.replace(SENTINEL_RE, '')
}

function maskEscapes(text: string): string {
  return text.replace(ESCAPE_RE, (_, ch: string) =>
    String.fromCharCode(SENTINEL_BASE + ESCAPABLE.indexOf(ch)))
}

function sentinelChar(sentinel: string): string {
  return ESCAPABLE[sentinel.charCodeAt(0) - SENTINEL_BASE]!
}

/** Blatt eines Text-Knotens: aus `\*` wird `*`. */
function unmaskAsLiteral(text: string): string {
  return text.replace(SENTINEL_RE, sentinelChar)
}

/** Innerhalb von Code gilt kein Escape — der Backslash bleibt stehen. */
function unmaskAsCode(text: string): string {
  return text.replace(SENTINEL_RE, s => `\\${sentinelChar(s)}`)
}

/**
 * Bewusst KLEINE Namensliste. CommonMark erlaubt alle ~2000 HTML5-Namen; hier
 * zählt, was ein Serialisierer erzeugt (`@tiptap/markdown` schreibt NUR
 * `&amp; &lt; &gt;`) plus die Handvoll, die Menschen tippen. Ein unbekannter
 * Name bleibt sichtbarer Text — das ist ebenfalls CommonMark und die sichere
 * Richtung: lieber `&copy;` anzeigen als raten.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: '\u00A0',
}

const ENTITY_RE = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{0,31}));/g

function fromCodePoint(code: number): string {
  // U+0000, Surrogate-Hälften und alles jenseits der Ebene 16 sind nach
  // CommonMark U+FFFD. Die private Zone ebenfalls: sonst könnte `&#xE000;`
  // ein Ersatzzeichen einschleusen, das die Entmaskierung danach zu einem
  // echten Interpunktionszeichen macht.
  if (code === 0 || code > 0x10FFFF) return '�'
  if (code >= 0xD800 && code <= 0xDFFF) return '�'
  if (code >= SENTINEL_BASE && code < SENTINEL_BASE + ESCAPABLE.length) return '�'
  return String.fromCodePoint(code)
}

function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(ENTITY_RE, (whole, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (dec !== undefined) return fromCodePoint(Number.parseInt(dec, 10))
    if (hex !== undefined) return fromCodePoint(Number.parseInt(hex, 16))
    return NAMED_ENTITIES[name!] ?? whole
  })
}

/**
 * Ein Text-Blatt fertigstellen. Reihenfolge ist nicht beliebig: ERST Entities,
 * DANN entmaskieren. Andersherum würde aus `\&amp;` (= der literale Text
 * „&amp;") am Ende ein blosses `&`.
 */
function finishText(masked: string): string {
  return unmaskAsLiteral(decodeEntities(masked))
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

/**
 * Öffentlicher Einstieg für rohen Text (Tests, Einzelzeilen). Maskiert selbst;
 * `parseMarkdown` maskiert schon auf Block-Ebene und ruft deshalb direkt
 * `parseInlineMasked`.
 */
export function parseInline(text: string): InlineNode[] {
  return parseInlineMasked(maskEscapes(stripSentinels(text)))
}

function parseInlineMasked(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let rest = text
  while (rest.length > 0) {
    const match = INLINE_RE.exec(rest)
    if (!match) {
      nodes.push({ type: 'text', text: finishText(rest) })
      break
    }
    if (match.index > 0) nodes.push({ type: 'text', text: finishText(rest.slice(0, match.index)) })
    if (match[2] !== undefined) nodes.push({ type: 'strong', children: parseInlineMasked(match[2]) })
    else if (match[4] !== undefined) nodes.push({ type: 'em', children: parseInlineMasked(match[4]) })
    // In Code gilt kein Escape und keine Entity — nur die Maskierung zurück.
    else if (match[6] !== undefined) nodes.push({ type: 'code', text: unmaskAsCode(match[6]) })
    else if (match[11] !== undefined) nodes.push({ type: 'strong', children: parseInlineMasked(match[11]) })
    else if (match[13] !== undefined) nodes.push({ type: 'em', children: parseInlineMasked(match[13]) })
    else if (match[8] !== undefined && match[9] !== undefined) {
      // Das Ziel wird ZUERST fertiggestellt und DANN geprüft — sonst käme
      // `javascript&#58;alert(1)` an isSafeHref vorbei.
      const href = finishText(match[9])
      // Unsichere Ziele (javascript:, data:, //evil) NICHT verlinken — nur Text
      if (isSafeHref(href)) nodes.push({ type: 'link', href, children: parseInlineMasked(match[8]) })
      else nodes.push({ type: 'text', text: finishText(match[8]) })
    }
    rest = rest.slice(match.index + match[0].length)
  }
  return nodes
}

export function parseMarkdown(source: string): BlockNode[] {
  const blocks: BlockNode[] = []
  // Maskiert wird VOR der Block-Erkennung: `\# kein Kopf` und `\- keine Liste`
  // sind Absätze, nicht Überschrift und Liste.
  const lines = maskEscapes(stripSentinels(source)).split('\n')
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
      // Codeblock: kein Escape, keine Entity — nur die Maskierung zurücknehmen.
      blocks.push({ type: 'codeblock', text: unmaskAsCode(buf.join('\n')) })
      continue
    }

    // Überschrift (##/###) — die Seiten-Überschrift (h1) ist separat, daher h2/h3
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line.trimStart())
    if (headingMatch) {
      const level = headingMatch[1]!.length <= 2 ? 2 : 3
      blocks.push({ type: 'heading', level, children: parseInlineMasked(headingMatch[2]!.trim()) })
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
        items.push(parseInlineMasked(m[1]!))
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
      blocks.push({ type: 'quote', children: parseInlineMasked(buf.join('\n')) })
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
    blocks.push({ type: 'paragraph', children: parseInlineMasked(buf.join('\n')) })
  }

  return blocks
}
