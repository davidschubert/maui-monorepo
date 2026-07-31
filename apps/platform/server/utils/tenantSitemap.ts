/**
 * robots.txt + sitemap.xml der GEPOOLTEN App — PURE Bausteine (Audit-Befund S6).
 *
 * Warum hier und nicht in einem Layer (A14): die Route-Menge einer Kunden-Site
 * ist die KOMPOSITION dieser App (Startseite + CMS-Seiten des pages-Layers +
 * Feed des posts-Layers, gestaffelt nach Plan). Kein einzelner Produkt-Layer
 * kennt sie; die App darf alle Layer kennen. Vorbild ist
 * apps/marketing/server/utils/marketingRoutes.ts — der Unterschied: dort ist
 * die Liste handgeführt und für die ganze Site gleich, hier wird sie PRO
 * REQUEST-HOST aus echten Mandanten-Daten gebaut.
 *
 * Alles in dieser Datei ist bewusst frei von h3/Nuxt: die Routen
 * (server/routes/robots.txt.get.ts, sitemap.xml.get.ts) besorgen Origin, Daten
 * und Header, die Entscheidungen hier sind reine Zeichenketten-Arbeit.
 */

/** Ein Sitemap-Eintrag in der EN-Default-Locale (ohne Prefix). */
export interface TenantSitemapEntry {
  /** Pfad wie ihn die Default-Locale (en) ausliefert: '/', '/feed', '/imprint'. */
  path: string
  /** Relative Priorität (0.0–1.0) — wie in der Marketing-Sitemap. */
  priority: number
}

/**
 * Slugs, die in eine Sitemap dürfen. Identisch zur Validierung des
 * pages-Layers (`packages/pages/schemas/page.ts`), hier bewusst als eigene
 * Fail-safe-Wache statt als Import: kommt aus der Tabelle je ein Wert, der
 * dieser Form NICHT entspricht (Altbestand, Direkt-Schreiber), wäre die
 * Alternative XML-Escaping — und ein Sitemap-Eintrag, der escaped werden muss,
 * ist ohnehin keine gültige URL. Solche Slugs fallen deshalb raus.
 */
const SAFE_SLUG = /^[a-z][a-z0-9-]*$/

/** Die Startseite eines Mandanten ist die CMS-Seite `home` — sie liegt unter '/'. */
const HOME_SLUG = 'home'

export interface TenantSitemapInput {
  /** Slugs der VERÖFFENTLICHTEN CMS-Seiten (aus /api/pages/public). */
  pageSlugs: readonly string[]
  /** Darf der Plan dieses Mandanten das Produkt `posts`? Dann gibt es /feed. */
  feed: boolean
}

/**
 * Die öffentlichen Routen EINES Mandanten-Hosts — PURE Entscheidung.
 *
 * Bewusst NICHT dabei: /login, /register, /settings, /dashboard/** (Anmelde-
 * und Betreiberbereich) und /embed (existiert für iframes, nicht für den Index).
 * `home` erscheint als '/', nicht als '/home' — genau so rendert die App
 * (apps/platform/app/pages/index.vue liest die home-Seite).
 */
export function tenantSitemapEntries(input: TenantSitemapInput): TenantSitemapEntry[] {
  const entries: TenantSitemapEntry[] = [{ path: '/', priority: 1.0 }]
  if (input.feed) entries.push({ path: '/feed', priority: 0.8 })

  const slugs = [...new Set(input.pageSlugs)]
    .filter(slug => slug !== HOME_SLUG && SAFE_SLUG.test(slug))
    .sort()
  for (const slug of slugs) entries.push({ path: `/${slug}`, priority: 0.5 })

  return entries
}

/**
 * EN-Pfad → DE-Pfad (i18n-Strategie 'prefix_except_default': en ohne Prefix,
 * de unter /de/*). Die Startseite ist '/de', nicht '/de/'.
 */
export function dePathFor(enPath: string): string {
  return enPath === '/' ? '/de' : `/de${enPath}`
}

/**
 * sitemap.xml für EINEN Mandanten-Host.
 *
 * Jede URL trägt ihre hreflang-Alternates (Muster der Marketing-Sitemap),
 * damit Google die EN/DE-Paare erkennt. `lastmod` bleibt bewusst WEG: die
 * öffentliche Seiten-Liste liefert kein Änderungsdatum, und ein erfundenes
 * Datum ist schlechter als keins.
 */
export function tenantSitemapXml(origin: string, entries: readonly TenantSitemapEntry[]): string {
  const urls = entries.flatMap((entry) => {
    const enUrl = `${origin}${entry.path === '/' ? '' : entry.path}`
    const deUrl = `${origin}${dePathFor(entry.path)}`
    const alternates = [
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${enUrl}"/>`,
      `    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}"/>`,
      `    <xhtml:link rel="alternate" hreflang="de" href="${deUrl}"/>`,
    ].join('\n')

    return [enUrl, deUrl].map(loc => [
      '  <url>',
      `    <loc>${loc}</loc>`,
      alternates,
      `    <priority>${entry.priority.toFixed(1)}</priority>`,
      '  </url>',
    ].join('\n'))
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}

/**
 * robots.txt eines Mandanten-Hosts: die Community SOLL gefunden werden.
 *
 * Die Sitemap-Zeile zeigt auf die EIGENE Origin des Mandanten — nicht auf den
 * Betreiber-Host. Eine Sitemap unter fremder Domain ignoriert Google (und sie
 * würde die Kunden-Domain gegen den Betreiber ausspielen); es ist derselbe
 * Grund, aus dem canonical/hreflang seit Befund B1 aus dem Request-Host kommen.
 */
export function tenantRobotsTxt(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    // Kein Index-Material: API-Antworten (Health/Telemetrie/Daten) und der
    // Betreiberbereich (hinter Anmeldung, ein Crawler sieht dort nur Redirects).
    'Disallow: /api/',
    'Disallow: /dashboard/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
}

/**
 * robots.txt eines KONTROLL-Hosts (my./start. — pukalani.tenancy.controlHosts).
 *
 * Kundenbereich und Onboarding-Wizard sind kein SEO-Ziel: sie tragen keinen
 * öffentlichen Inhalt, führen hinter eine Anmeldung und würden als
 * Suchergebnis nur den Trichter verwässern (beworben wird der Kurz-Link).
 * Deshalb komplett zu — und ohne Sitemap-Zeile, weil es dort nichts zu
 * deklarieren gibt (sitemap.xml antwortet auf diesen Hosts 404).
 */
export function controlHostRobotsTxt(): string {
  return [
    'User-agent: *',
    'Disallow: /',
    '',
  ].join('\n')
}

/**
 * robots.txt einer GESCHLOSSENEN Community (C18, `audience === 'members'`).
 *
 * Dieselben zwei Zeilen wie beim Kontroll-Host, aber aus einem anderen Grund —
 * und deshalb eine eigene Funktion statt eines geteilten Aufrufs: dort gibt es
 * nichts zu indexieren, hier gibt es sehr wohl Inhalt, er ist nur nicht für
 * Gäste. Fiele die eine Entscheidung später weg, soll die andere stehen bleiben.
 *
 * OHNE Sitemap-Zeile: die sitemap.xml einer geschlossenen Community ist leer,
 * und ein Verweis auf ein leeres Dokument lädt Crawler nur ein.
 *
 * Ehrlichkeit dazu: robots.txt ist eine BITTE, keine Grenze. Die Grenze sind
 * die Row-Permissions (`read(label:<communityId>)`) — ohne sie wäre das hier
 * Kosmetik. Und was schon im Index steht, verschwindet nicht sofort: Google
 * braucht Tage bis Wochen, genau das sagt der Hinweis im Dashboard.
 */
export function membersOnlyRobotsTxt(): string {
  return [
    'User-agent: *',
    'Disallow: /',
    '',
  ].join('\n')
}
