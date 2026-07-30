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
 * Ein link-/meta-Eintrag, wie `useLocaleHead` ihn LIEFERT: @nuxtjs/i18n
 * typisiert seine Kopf-Einträge selbst nur als `Record<string, string>`
 * (`MetaAttrs`). Das ist die EINGANGS-Form — was hier herauskommt, ist präziser
 * (`SeoHeadLink`/`SeoHeadMeta`).
 */
export type SeoHeadAttrs = Record<string, string>

/**
 * Ein rel, dessen href zum Request-Host gehört: canonical + hreflang-Alternates.
 * Es sind genau die zwei rels, die `useLocaleHead` überhaupt erzeugt.
 */
export type RebasedRel = 'canonical' | 'alternate'

/**
 * Ein link-Eintrag des SEO-Kopfs — in der Form, die `useHead` VERLANGT.
 *
 * Warum es diesen Typ überhaupt gibt (Nuxt 4.5 bringt unhead 3, vorher 2.1):
 * unhead typisiert link-Einträge seit v3 als über `rel` DISKRIMINIERTE Union
 * (`CanonicalLink | AlternateLanguageLink | StylesheetLink | …`) und hat für
 * unbekannte rels bewusst KEIN Mitglied in der Union. Ein zu `string`
 * verbreitertes `rel` wählt darin nichts aus und wird zu `never` — der frühere
 * `Record<string, string>` war damit nicht mehr an `useHead` übergebbar.
 * `Record<string, string>` hat auch nie ausgedrückt, was ein link-Tag IST; dass
 * es trotzdem dastand, liegt an @nuxtjs/i18n, das seine eigenen Kopf-Einträge
 * bis heute (10.6.0 geprüft) nur so typisiert.
 *
 * Es sind GENAU zwei Formen, nicht „unter anderem diese zwei":
 * `@nuxtjs/i18n/dist/runtime/kit/head.js` erzeugt ausschließlich
 * `{ id?, rel: 'canonical', href }` und `{ id?, rel: 'alternate', href,
 * hreflang }` (im `strictSeo`-Modus dieselben ohne `id`).
 */
export type SeoHeadLink =
  | { rel: 'canonical', href: string, id?: string }
  | { rel: 'alternate', href: string, hreflang: string, id?: string }

/**
 * Ein meta-Eintrag des SEO-Kopfs (og:url, og:locale, og:image, twitter:card …).
 *
 * Ebenfalls diskriminiert, aus demselben Grund wie `SeoHeadLink`: unhead 3
 * unterscheidet `NameMeta | PropertyMeta | HttpEquivMeta | CharsetMeta`. Ein
 * Eintrag mit Index-Signatur passt in keines davon (er müsste dann auch
 * `charset` mitbringen), deshalb stehen hier die zwei Formen, die im SEO-Kopf
 * wirklich vorkommen: `name=…` und `property=…`.
 */
export type SeoHeadMeta =
  | { name: string, content: string, id?: string }
  | { property: string, content: string, id?: string }

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

/** canonical- und alternate-Links auf den Ziel-Origin umschreiben (Rest unberührt). */
export function rebaseSeoLinks(links: readonly SeoHeadAttrs[], origin: string): SeoHeadAttrs[] {
  if (!origin) return [...links]
  return links.map((link) => {
    if (!link.href || !isRebasedRel(link.rel)) return link
    return { ...link, href: rebaseSeoUrl(link.href, origin) }
  })
}

/**
 * Die losen i18n-Einträge in die von unhead 3 geforderte, über `rel`
 * diskriminierte Form bringen — die Naht zwischen @nuxtjs/i18n und `useHead`.
 *
 * Bewusst FELDWEISE aufgebaut statt per Spread: ein `{ ...link }` schleppt die
 * Index-Signatur `Record<string, string>` mit, und die macht aus jedem
 * Attribut, das unhead eng typisiert (`fetchpriority`, `crossorigin`, …), ein
 * `string` — der Typfehler wäre nur verschoben. Feldweise ist es zugleich
 * vollständig: `head.js` setzt an einem canonical/alternate genau diese
 * Attribute, mehr gibt es dort nicht zu verlieren.
 *
 * Ein unerwartetes `rel` kann hier nicht durchfallen, weil `useLocaleHead`
 * keines erzeugt; käme je eines dazu, fiele es im Kopf-Vergleich der Tests auf
 * (und nicht still im Betrieb).
 */
export function toSeoHeadLinks(links: readonly SeoHeadAttrs[]): SeoHeadLink[] {
  const out: SeoHeadLink[] = []
  for (const link of links) {
    // `?? ''` ändert die AUSGABE nicht: den einen Eintrag ohne Ziel (x-default
    // auf einer Seite ohne Gegenstück) rendert unhead sowohl für '' als auch
    // für undefined als attributloses `href` — genau wie vor Nuxt 4.5.
    // Schlüssel-REIHENFOLGE wie bei i18n (`id` zuerst): unhead serialisiert die
    // Attribute in Objekt-Reihenfolge, und so bleibt das gerenderte Tag
    // BYTE-gleich statt nur bedeutungsgleich.
    if (link.rel === 'canonical') {
      out.push({ id: link.id, rel: 'canonical', href: link.href ?? '' })
    }
    else if (link.rel === 'alternate') {
      out.push({ id: link.id, rel: 'alternate', href: link.href ?? '', hreflang: link.hreflang ?? '' })
    }
  }
  return out
}

/** og:url auf den Ziel-Origin umschreiben (og:locale & Co. bleiben unberührt). */
export function rebaseSeoMeta(meta: readonly SeoHeadAttrs[], origin: string): SeoHeadAttrs[] {
  if (!origin) return [...meta]
  return meta.map((entry) => {
    if (entry.property !== 'og:url' || !entry.content) return entry
    return { ...entry, content: rebaseSeoUrl(entry.content, origin) }
  })
}

/**
 * Pendant zu `toSeoHeadLinks` für die meta-Einträge: `property=…` (og:*, was
 * useLocaleHead liefert) und `name=…`. Ohne `content` gibt es nichts zu
 * rendern — solche Einträge erzeugt useLocaleHead nicht.
 */
export function toSeoHeadMeta(meta: readonly SeoHeadAttrs[]): SeoHeadMeta[] {
  const out: SeoHeadMeta[] = []
  for (const entry of meta) {
    const content = entry.content ?? ''
    // `id` zuerst — wie bei toSeoHeadLinks, damit das Tag byte-gleich bleibt.
    if (entry.property !== undefined) {
      out.push({ id: entry.id, property: entry.property, content })
    }
    else if (entry.name !== undefined) {
      out.push({ id: entry.id, name: entry.name, content })
    }
  }
  return out
}
