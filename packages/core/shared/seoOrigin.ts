/**
 * SEO-Basis pro Request-Host — PURE Umrechnung der Kopf-URLs.
 *
 * Warum es das gibt (Audit-Befund B1, 2026-07-27): `i18n.baseUrl` ist EINE
 * Env pro App (`NUXT_PUBLIC_I18N_BASE_URL`). In der gepoolten App bedient
 * derselbe Prozess aber viele Hosts — canonical, alle hreflang-Alternates und
 * og:url zeigten damit auf JEDEM Mandanten-Host auf den Betreiber-Host
 * (`platform.pukalani.app`): Google indexiert die Kundendomain nicht und die
 * Sprachlinks führen aus dem Mandanten heraus.
 *
 * Der Vertrag ist bewusst klein und ohne Nuxt-Abhängigkeit (deshalb shared/,
 * unit-testbar): aus einem Request-Origin und der konfigurierten Basis-URL
 * wird EIN Origin, und darauf werden die von useLocaleHead gelieferten
 * link-/meta-Einträge umgeschrieben.
 *
 * Nur HOST+PORT kommen aus dem Request, das SCHEMA bleibt Sache der Env: hinter
 * nginx spricht der Node-Prozess http, und ob der Proxy `X-Forwarded-Proto`
 * setzt, ist eine Server-Konfiguration, auf die sich SEO nicht verlassen darf.
 * Ist keine Basis-URL konfiguriert (lokale Entwicklung), gilt das Schema des
 * Requests.
 */

/** Ein link-/meta-Eintrag, wie useLocaleHead ihn liefert (MetaAttrs). */
export type SeoHeadAttrs = Record<string, string>

/** Rels, deren href zum Request-Host gehört: canonical + hreflang-Alternates. */
const REBASED_RELS = ['canonical', 'alternate']

function protocolOf(url: string | undefined | null): string {
  const raw = (url || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw).protocol
  }
  catch {
    return ''
  }
}

/**
 * Origin, auf den canonical/hreflang/og:url zeigen sollen.
 *
 * @param requestOrigin Origin des laufenden Requests (useRequestURL().origin)
 * @param configuredBaseUrl konfigurierte Basis-URL (i18n.baseUrl) — liefert NUR das Schema
 * @returns absoluter Origin oder '' (dann bleibt der Kopf unverändert)
 */
export function resolveSeoOrigin(requestOrigin: string | undefined | null, configuredBaseUrl?: string | null): string {
  const raw = (requestOrigin || '').trim()
  if (!raw) return ''
  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    return ''
  }
  const protocol = protocolOf(configuredBaseUrl)
  if (protocol === 'http:' || protocol === 'https:') {
    url.protocol = protocol
  }
  return url.origin
}

/**
 * Schreibt eine (absolute oder relative) Kopf-URL auf den Ziel-Origin um.
 * Pfad, Query und Fragment bleiben unberührt; unbrauchbare Werte kommen
 * unverändert zurück (der Kopf soll nie kaputter sein als vorher).
 */
export function rebaseSeoUrl(value: string, origin: string): string {
  if (!value || !origin) return value
  try {
    const target = new URL(origin)
    const rebased = new URL(value, target)
    rebased.protocol = target.protocol
    rebased.host = target.host
    return rebased.toString()
  }
  catch {
    return value
  }
}

/** canonical- und alternate-Links auf den Ziel-Origin umschreiben (Rest unberührt). */
export function rebaseSeoLinks(links: readonly SeoHeadAttrs[], origin: string): SeoHeadAttrs[] {
  if (!origin) return [...links]
  return links.map((link) => {
    const rel = link.rel
    if (!link.href || !rel || !REBASED_RELS.includes(rel)) return link
    return { ...link, href: rebaseSeoUrl(link.href, origin) }
  })
}

/** og:url auf den Ziel-Origin umschreiben (og:locale & Co. bleiben unberührt). */
export function rebaseSeoMeta(meta: readonly SeoHeadAttrs[], origin: string): SeoHeadAttrs[] {
  if (!origin) return [...meta]
  return meta.map((entry) => {
    if (entry.property !== 'og:url' || !entry.content) return entry
    return { ...entry, content: rebaseSeoUrl(entry.content, origin) }
  })
}
