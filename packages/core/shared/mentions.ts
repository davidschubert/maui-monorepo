/**
 * ERWÄHNUNGEN (@handle) — die PURE Regel. EINE Quelle für drei Leser:
 * den Renderer (hervorheben), den Server (auflösen + benachrichtigen) und die
 * Tests.
 *
 * ── EINE ERWÄHNUNG IST GEWÖHNLICHER TEXT ───────────────────────────────────
 * Gespeichert wird `@handle`, sonst nichts — kein Knoten, keine Klammer-Syntax,
 * keine Id im Fließtext. Das ist die Entscheidung, die alles andere einfach
 * macht: `community_posts.body` bleibt dasselbe Markdown-Subset wie vorher,
 * es gibt keine Migration für Bestandsinhalte, und ein Beitrag bleibt lesbar,
 * wenn man ihn irgendwo ohne unseren Renderer anschaut.
 * Die Schreibfläche musste dafür überredet werden: `@tiptap/markdown`
 * serialisiert einen Mention-KNOTEN sonst als `[@ id="…" label="…"]`. Der
 * eigene `renderMarkdown`-Handler in PostBodyEditor.vue macht `@handle` daraus
 * (gemessen, siehe docs/plans/COMPOSER-UEDITOR.md).
 *
 * ── WARUM ÜBER DEN AST UND NICHT ÜBER DEN ROHTEXT ──────────────────────────
 * Beide Leser gehen über `parseMarkdown`, nie über die rohe Zeichenkette. Das
 * hat zwei Gründe, und beide sind hier schon einmal teuer geworden:
 *  1. ESCAPES. Ein gespeichertes `@erika\_muster` (so schreibt es die
 *     Schreibfläche zurück, hartkodiert) ist im AST längst `@erika_muster`.
 *     Wer roh sucht, verliert genau die Handles mit Unterstrich — still.
 *  2. CODE. In `` `@david` `` und in einem ```-Block steht ein Name, der
 *     NICHT gemeint ist. Über den AST fällt das von selbst weg, weil
 *     Code-Knoten hier gar nicht erst besucht werden. Eine Regex über den
 *     Rohtext würde jemanden benachrichtigen, weil sein Name in einem
 *     Codebeispiel vorkommt.
 */

import { parseMarkdown, type BlockNode, type InlineNode } from './markdown'
import { HANDLE_MAX_LENGTH, normalizeHandle } from './handles'

/**
 * Obergrenze je Beitrag. Dieselbe Überlegung wie im comments-Layer
 * (MAX_MENTIONS = 5): mehr als eine Handvoll echter Erwähnungen gibt es nicht,
 * und die Grenze ist die Bremse gegen eine Liste aus 200 Namen, die 200
 * Benachrichtigungen und 200 Mails auslöst.
 */
export const MAX_MENTIONS_PER_CONTENT = 10

/**
 * Die Erkennungs-Regel.
 *
 * LINKE FLANKE (`(?<![\p{L}\p{N}_@])`) ist der wichtigste Teil und der Grund,
 * warum das keine schlichte `/@(\w+)/` ist: ohne sie wäre `kontakt@firma.de`
 * eine Erwähnung von `@firma` — E-Mail-Adressen stehen in Beiträgen ständig.
 * Das mitgesperrte `@` verhindert zusätzlich, dass `@@david` durchrutscht.
 *
 * Zeichensatz und Ränder sind identisch zu HANDLE_SHAPE_RE in handles.ts, nur
 * mit Großbuchstaben: getippt wird `@DavidSchubert`, verglichen wird klein.
 * Ein `_` am Ende gehört NICHT dazu — `@foo_` ist die Erwähnung `foo` und ein
 * übrig gebliebener Unterstrich.
 */
const MENTION_RE = /(?<![\p{L}\p{N}_@])@([A-Za-z0-9](?:[A-Za-z0-9_]*[A-Za-z0-9])?)/gu

export type MentionSegment
  = { type: 'text', text: string }
    /** `text` ist das, was dasteht (inkl. `@`); `handle` die Vergleichsform. */
    | { type: 'mention', text: string, handle: string }

/**
 * Ein Text-Blatt in Text- und Erwähnungs-Stücke zerlegen — der Renderer baut
 * daraus vnodes.
 *
 * `known` ist die Menge der Handles, die es in dieser Community WIRKLICH gibt
 * (Vergleichsform, klein). Fehlt sie, wird NICHTS als Erwähnung gemeldet:
 * fail-closed und damit ohne Wirkung auf alle bestehenden Aufrufer von
 * `MarkdownContent`. Ein Tippfehler-`@nmae` bleibt so gewöhnlicher Text,
 * statt so auszusehen, als führte er zu einem Menschen.
 */
export function splitMentions(text: string, known?: ReadonlySet<string>): MentionSegment[] {
  if (!known || known.size === 0 || !text.includes('@')) return [{ type: 'text', text }]

  const segments: MentionSegment[] = []
  let last = 0
  // Eigene Kopie: ein `g`-Regex trägt `lastIndex` mit sich, und dieses Modul
  // wird aus mehreren Komponenten gleichzeitig gerufen.
  const re = new RegExp(MENTION_RE.source, MENTION_RE.flags)

  for (const match of text.matchAll(re)) {
    const handle = normalizeHandle(match[1]!)
    if (handle.length > HANDLE_MAX_LENGTH || !known.has(handle)) continue

    const start = match.index
    if (start > last) segments.push({ type: 'text', text: text.slice(last, start) })
    segments.push({ type: 'mention', text: match[0], handle })
    last = start + match[0].length
  }

  if (segments.length === 0) return [{ type: 'text', text }]
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) })
  return segments
}

/** Alle Text-Blätter eines Blocks besuchen — Code wird bewusst übersprungen. */
function forEachTextLeaf(blocks: BlockNode[], visit: (text: string) => void): void {
  const inline = (nodes: InlineNode[]): void => {
    for (const node of nodes) {
      switch (node.type) {
        case 'text': visit(node.text); break
        case 'strong':
        case 'em': inline(node.children); break
        case 'link': inline(node.children); break
        // 'code' fehlt absichtlich (siehe Kopf).
      }
    }
  }

  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
      case 'quote': inline(block.children); break
      case 'list': for (const item of block.items) inline(item); break
      // 'codeblock' fehlt absichtlich (siehe Kopf).
    }
  }
}

/**
 * Alle KANDIDATEN aus einem Markdown-Text: Vergleichsform, ohne Doppelte, in
 * der Reihenfolge des Auftretens, gedeckelt.
 *
 * „Kandidaten" und nicht „Erwähnungen", weil hier niemand nachschlägt: ob es
 * den Handle gibt, weiß nur die Datenbank. Das ist die Trennung, die diese
 * Datei pur hält.
 */
export function extractMentionCandidates(markdown: string, limit: number = MAX_MENTIONS_PER_CONTENT): string[] {
  if (!markdown.includes('@')) return []

  const found: string[] = []
  const seen = new Set<string>()

  forEachTextLeaf(parseMarkdown(markdown), (text) => {
    if (found.length >= limit || !text.includes('@')) return
    const re = new RegExp(MENTION_RE.source, MENTION_RE.flags)
    for (const match of text.matchAll(re)) {
      const handle = normalizeHandle(match[1]!)
      if (handle.length > HANDLE_MAX_LENGTH || seen.has(handle)) continue
      seen.add(handle)
      found.push(handle)
      if (found.length >= limit) return
    }
  })

  return found
}
