/**
 * E3 Site-Registry — PURE Allowlist-Logik (unit-getestet, vom
 * embed-frame-Plugin und der /embed-Seite geteilt):
 *
 * - Statische Origins (`maui.comments.embed.allowedOrigins`) und Registry-
 *   Hosts werden VEREINT; '*' in der statischen Liste = alles offen
 *   (bewusste Betreiber-Option, Plan § 6.7) — die Registry ist dann nur
 *   noch dokumentarisch.
 * - Registry-Hosts werden als https-Origin in die CSP gehoben
 *   (Einbetter ohne TLS sind kein unterstütztes Szenario).
 */

export interface EmbedSiteLike {
  host: string
  targetTypes: string[]
  active: boolean
}

/** CSP-Origins aus statischer Liste + aktiven Registry-Sites. */
export function resolveEmbedOrigins(staticOrigins: string[], sites: EmbedSiteLike[]): string[] {
  if (staticOrigins.includes('*')) return ['*']
  const fromRegistry = sites.filter(s => s.active).map(s => `https://${s.host}`)
  return [...new Set([...staticOrigins, ...fromRegistry])]
}

/** Kanonischer Host aus einer Hostseiten-URL ('' wenn unparsebar). */
export function hostOfUrl(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname.toLowerCase() : ''
  }
  catch {
    return ''
  }
}

export type EmbedHostVerdict = 'allowed' | 'unknown-host' | 'target-type-blocked'

/**
 * Best-effort-Prüfung der /embed-Seite gegen die Registry (die HARTE Grenze
 * ist die CSP — hier geht es um eine freundliche Fehlermeldung im iframe
 * statt eines leeren Rahmens, plus targetType-Begrenzung je Site).
 * Ohne Host (fehlender/unparsebarer url-Param) wird NICHT geblockt —
 * die CSP hat dann bereits entschieden.
 */
export function checkEmbedHost(
  staticOrigins: string[],
  sites: EmbedSiteLike[],
  hostUrl: string | undefined,
  targetType: string,
): EmbedHostVerdict {
  if (staticOrigins.includes('*')) return 'allowed'
  const host = hostOfUrl(hostUrl)
  if (!host) return 'allowed'
  // statisch erlaubte Origins (inkl. localhost:*-Wildcard) → keine Registry-Pflicht
  const staticHosts = staticOrigins.map(o => hostOfUrl(o.replace(':*', '')))
  if (staticHosts.includes(host)) return 'allowed'
  const site = sites.find(s => s.active && s.host === host)
  if (!site) return 'unknown-host'
  if (site.targetTypes.length > 0 && !site.targetTypes.includes(targetType)) return 'target-type-blocked'
  return 'allowed'
}
