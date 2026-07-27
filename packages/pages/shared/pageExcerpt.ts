/** Standardlänge einer meta description (Suchmaschinen kürzen ~155–160). */
export const PAGE_EXCERPT_MAX_LENGTH = 160

/**
 * Kurzfassung einer CMS-Seite für meta description/og:description
 * (Audit-Befund S5): der ERSTE echte Textabsatz des Markdown-Bodys, ohne
 * Syntax, auf `maxLength` an einer Wortgrenze gekürzt.
 *
 * Bewusst pure (kein Vue, kein Nuxt) und im Layer-`shared/`, damit sie auch
 * server-seitig verwendbar und ohne Nuxt-Kontext testbar ist.
 *
 * Übersprungen werden Blöcke, die keine Beschreibung liefern: Code-Zäune,
 * Überschriften (die stehen schon im Titel), reine Bilder/Links, Trennlinien
 * und Tabellenzeilen.
 */
export function pageExcerpt(body: string, maxLength: number = PAGE_EXCERPT_MAX_LENGTH): string {
  if (!body) return ''

  const withoutCode = stripFencedCode(body.replace(/\r\n?/g, '\n'))
    // HTML-Kommentare + Tags (der Body darf Markdown mit HTML-Inseln sein)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')

  for (const block of withoutCode.split(/\n\s*\n/)) {
    const text = stripInlineMarkdown(block)
    if (text.length === 0) continue
    if (isSkippableBlock(block)) continue
    return truncateAtWord(text, maxLength)
  }

  return ''
}

/**
 * Code-Zäune (```…``` / ~~~…~~~) samt Inhalt entfernen — zeilenweise statt per
 * Regex, weil ein Regex-Zaun am Zeilenende entweder zu früh schließt oder den
 * ganzen Rest schluckt.
 *
 * Ein NIE geschlossener Zaun (abgeschnittener Body) wird bewusst nachsichtig
 * behandelt: nur die Zaunzeile fällt, der Text danach bleibt — sonst hätte eine
 * einzelne Backtick-Zeile die ganze Beschreibung gelöscht.
 */
function stripFencedCode(text: string): string {
  const kept: string[] = []
  let pending: string[] | null = null

  for (const line of text.split('\n')) {
    if (/^\s{0,3}(?:```|~~~)/.test(line)) {
      if (pending) pending = null // Zaun geschlossen → Inhalt verworfen
      else pending = []
      kept.push('')
      continue
    }
    if (pending) pending.push(line)
    else kept.push(line)
  }

  if (pending) kept.push(...pending)
  return kept.join('\n')
}

/** Blocktypen, die als Beschreibung nichts hergeben. */
function isSkippableBlock(block: string): boolean {
  const trimmed = block.trim()
  // Überschrift (# … / Setext-Unterstreichung)
  if (/^#{1,6}\s/.test(trimmed)) return true
  if (/^[^\n]+\n\s*(?:=+|-{2,})\s*$/.test(trimmed)) return true
  // Trennlinie
  if (/^\s*(?:[-*_]\s*){3,}$/.test(trimmed)) return true
  // Nur Bild(er)
  if (/^(?:!\[[^\]]*\]\([^)]*\)\s*)+$/.test(trimmed)) return true
  // Tabellen-Trennzeile
  if (/^\|?[\s:|-]+\|[\s:|-]*$/.test(trimmed)) return true
  return false
}

/** Inline-Syntax entfernen und Zeilenumbrüche zu einzelnen Leerzeichen. */
function stripInlineMarkdown(block: string): string {
  return block
    // Bilder ganz weg (Alt-Text ist keine Beschreibung der Seite)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    // Links → Linktext
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Referenz-Links → Linktext
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    // Autolinks
    .replace(/<((?:https?|mailto):[^>]+)>/g, '$1')
    // Zeilen-Präfixe: Zitat, Listenpunkt, numerierte Liste, Überschrift
    .replace(/^\s{0,3}(?:>+\s?|[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)/gm, '')
    // Inline-Code, Betonung, Durchstreichung
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/(\*\*|__|~~)(.*?)\1/g, '$2')
    .replace(/(?<![\w*])[*_](?=\S)([^*_]*?)(?<=\S)[*_](?![\w*])/g, '$1')
    // Tabellenzellen-Trenner
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Auf maxLength kürzen — an der letzten Wortgrenze, mit Auslassungszeichen. */
function truncateAtWord(text: string, maxLength: number): string {
  if (maxLength <= 0) return ''
  if (text.length <= maxLength) return text

  const hard = text.slice(0, maxLength - 1)
  const lastSpace = hard.lastIndexOf(' ')
  const head = (lastSpace > maxLength / 2 ? hard.slice(0, lastSpace) : hard).replace(/[\s,;:.!?-]+$/, '')
  return `${head}…`
}
