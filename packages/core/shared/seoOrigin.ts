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

/**
 * Ein rel, dessen href zum Request-Host gehört: canonical + hreflang-Alternates.
 * Es sind genau die zwei rels, die `useLocaleHead` überhaupt erzeugt.
 */
export type RebasedRel = 'canonical' | 'alternate'

/**
 * Das MINDESTE, was ein link-Eintrag mitbringen muss, damit hier ein href
 * umgeschrieben werden kann. Bewusst eine Schranke und kein fertiger Typ:
 * die Funktionen unten sind generisch und geben GENAU den Typ zurück, den sie
 * bekommen haben.
 *
 * Warum das wichtig ist (Nuxt 4.5 bringt unhead 3): unhead typisiert
 * link-Einträge seit v3 als über `rel` DISKRIMINIERTE Union (`CanonicalLink |
 * AlternateLanguageLink | …`) und hat für unbekannte rels bewusst KEIN
 * Mitglied. Ein zu `string` verbreitertes `rel` wählt darin nichts aus und
 * wird zu `never`. Würde hier auf `Record<string, string>` verengt, wäre das
 * Ergebnis nicht mehr an `useHead` übergebbar — die Durchreiche über `T`
 * erhält die Präzision, die @nuxtjs/i18n seit 10.6 selbst liefert
 * (`I18nHeadMetaInfo.link` ist dort `(AlternateLanguageLink | CanonicalLink)[]`).
 */
export interface SeoHeadLinkLike {
  rel?: string
  href?: string
}

/** Pendant für meta-Einträge (og:url & Co.) — nur was hier gelesen wird. */
export interface SeoHeadMetaLike {
  property?: string
  content?: unknown
}

/**
 * Ein meta-Eintrag, den DIESER Layer selbst baut (og:image, twitter:card).
 * `name`/`property` bleiben getrennt, weil unhead auch die meta-Seite
 * diskriminiert (`NameMeta | PropertyMeta | …`).
 */
export type SeoHeadMeta =
  | { name: string, content: string }
  | { property: string, content: string }

/** Laufzeit-Prüfung, die `rel` auf den Literal-Typ verengt (kein Cast). */
function isRebasedRel(rel: string | undefined): rel is RebasedRel {
  return rel === 'canonical' || rel === 'alternate'
}

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

/**
 * canonical- und alternate-Links auf den Ziel-Origin umschreiben
 * (Rest unberührt).
 *
 * Generisch mit Durchreiche: heraus kommt GENAU der Eintrags-Typ, der
 * hineinging. Nur so bleibt das Ergebnis an `useHead` übergebbar — siehe
 * `SeoHeadLinkLike`. Der Spread ist hier unbedenklich, weil `T` keine
 * Index-Signatur mitbringt (i18n liefert seit 10.6 präzise unhead-Typen).
 */
export function rebaseSeoLinks<T extends SeoHeadLinkLike>(links: readonly T[], origin: string): T[] {
  if (!origin) return [...links]
  return links.map((link) => {
    if (!link.href || !isRebasedRel(link.rel)) return link
    return { ...link, href: rebaseSeoUrl(link.href, origin) }
  })
}

/**
 * og:url auf den Ziel-Origin umschreiben (og:locale & Co. bleiben unberührt).
 * Ebenfalls Durchreiche — `content` wird nur angefasst, wenn dort wirklich ein
 * String steht (unhead erlaubt auch Zahlen und Arrays).
 */
export function rebaseSeoMeta<T extends SeoHeadMetaLike>(meta: readonly T[], origin: string): T[] {
  if (!origin) return [...meta]
  return meta.map((entry) => {
    if (entry.property !== 'og:url' || typeof entry.content !== 'string' || !entry.content) return entry
    return { ...entry, content: rebaseSeoUrl(entry.content, origin) }
  })
}
