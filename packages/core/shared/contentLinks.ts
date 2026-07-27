/**
 * Link-POLICY des Markdown-Sinks (MarkdownContent) — bewusst getrennt von
 * shared/markdown.ts: dort steckt das PARSEN (und mit isSafeHref die
 * Sicherheits-Schranke), hier die Frage „wie wird ein bereits als sicher
 * eingestufter Href gerendert?".
 *
 * Warum überhaupt: interne Links in Inhalten (CMS-Seiten, Posts, Kommentare)
 * wurden wie fremde Links behandelt — `rel="noopener noreferrer nofollow"`
 * plus voller Seiten-Reload, und auf `/de/*` führte `[Feed](/feed)` zurück in
 * die EN-Route (Sprachwechsel beim Klick). Audit-Befund S3, live auf
 * demo.pukalani.app/de belegt.
 *
 * Diese Klassifizierung ist ABSICHTLICH eine pure Funktion ohne Router/i18n:
 * die eigentliche Lokalisierung macht `localePath()` im Renderer (nur die
 * kennt die i18n-Strategie), testbar bleibt die Entscheidung darüber.
 */

export type ContentLinkKind
  /** Fremdes Ziel (http/https oder alles Unerwartete) — nofollow/noreferrer/_blank. */
  = | 'external'
    /** Eigener Pfad OHNE Locale-Prefix — muss lokalisiert werden. */
    | 'internal'
    /** Eigener Pfad, der schon einen Locale-Prefix trägt — unangetastet lassen. */
    | 'internal-localized'

/**
 * Klassifiziert ein Link-Ziel aus Inhalten.
 *
 * @param href Ziel aus dem Markdown-AST (bereits durch isSafeHref gefiltert:
 *   nur `https?://…` oder `/pfad`). Alles andere wird defensiv als extern
 *   behandelt — nie als eigener Pfad.
 * @param localeCodes Konfigurierte i18n-Codes (z. B. ['de', 'en']).
 */
export function classifyContentLink(href: string, localeCodes: readonly string[]): ContentLinkKind {
  // Protokoll-relativ (`//evil.com`) beginnt mit '/', ist aber FREMD.
  if (!href.startsWith('/') || href.startsWith('//')) return 'external'

  const firstSegment = href.slice(1).split(/[/?#]/)[0]!.toLowerCase()
  return localeCodes.some(code => code.toLowerCase() === firstSegment)
    ? 'internal-localized'
    : 'internal'
}
