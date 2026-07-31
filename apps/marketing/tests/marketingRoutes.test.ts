/**
 * Sitemap-Test (Route-Vergleich): MARKETING_ROUTES gegen die Seiten, die es
 * wirklich gibt. Am 2026-07-30/31 traten live genau die Fehlerklassen auf,
 * die dieser Abgleich fängt:
 *   1. Nach URL-Umzügen (features→products, for/fuer→use-cases, lokalisierte
 *      Slugs) standen weiterleitende ALT-Adressen als kanonisch in der Sitemap
 *      — und der feature→product-Rename machte aus '/features/**' kurz einen
 *      Self-Redirect, der jede EN-Produktseite in eine 301-Schleife schickte.
 *   2. Zwei existierende Produktseiten (moderation, beitraege) fehlten
 *      komplett, weil die Slug-Liste doppelt gepflegt war.
 *
 * Quellen der Wahrheit — bewusst NICHT die Sitemap selbst:
 *   - die Kataloge in shared/marketing.ts (PRODUCT_KEYS/AUDIENCE_KEYS mit
 *     lokalisierten Slugs, VS_SLUGS). Der Test liest den 404-Guard aus dem
 *     Seiten-Quelltext und schlägt fehl, wenn eine Seite an einem anderen
 *     Katalog hängt als die Sitemap,
 *   - die Dateien unter app/pages/ samt ihrer defineI18nRoute-Pfade (daher
 *     kommen die Segmente /products vs. /produkte — NICHT aus der Sitemap
 *     zurückgelesen, sonst wäre der Vergleich eine Tautologie),
 *   - die Redirect-QUELLEN der routeRules in nuxt.config.ts (eine Sitemap darf
 *     nur Zieladressen anbieten, keine Weiterleitungen).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AUDIENCE_KEYS,
  audienceSlugForLocale,
  PRODUCT_KEYS,
  slugForLocale,
  VS_SLUGS,
} from '../shared/marketing'
import { MARKETING_ROUTES } from '../server/utils/marketingRoutes'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PAGES_DIR = join(APP_ROOT, 'app', 'pages')

// Rechtsseiten sind bis zu den verbindlichen Texten noindex und fehlen
// ABSICHTLICH in der Sitemap (Begründung am Ende von MARKETING_ROUTES in
// server/utils/marketingRoutes.ts). Neue Ausnahmen brauchen denselben Grund.
const NOINDEX_PAGES = new Set(['agb.vue', 'datenschutz.vue', 'impressum.vue'])

/**
 * Welcher 404-Guard im Seiten-Quelltext auf welchen Katalog zeigt. Der Guard
 * entscheidet, welche Slugs die Seite WIRKLICH trägt — je Sprache, weil die
 * Slugs seit 2026-07-31 lokalisiert sind (/products/courses ↔
 * /de/produkte/kurse). en[i] und de[i] gehören zum selben kanonischen
 * Schlüssel, die Paarung ist also Inhalt.
 */
const DYNAMIC_GUARDS = [
  {
    name: 'keyFromSlug (PRODUCT_KEYS)',
    pattern: /\bkeyFromSlug\(/,
    en: PRODUCT_KEYS.map(key => slugForLocale(key, 'en')),
    de: PRODUCT_KEYS.map(key => slugForLocale(key, 'de')),
  },
  {
    name: 'audienceKeyFromSlug (AUDIENCE_KEYS)',
    pattern: /\baudienceKeyFromSlug\(/,
    en: AUDIENCE_KEYS.map(key => audienceSlugForLocale(key, 'en')),
    de: AUDIENCE_KEYS.map(key => audienceSlugForLocale(key, 'de')),
  },
  {
    name: 'VS_SLUGS.includes',
    pattern: /\bVS_SLUGS\.includes\(/,
    en: [...VS_SLUGS],
    de: [...VS_SLUGS],
  },
]

interface PageUrls {
  file: string
  en: string
  de: string
}

/**
 * EN/DE-URLs einer Seiten-Datei. defineI18nRoute gewinnt (locale-eigene
 * Segmente wie /gdpr ↔ /de/dsgvo); ohne die Direktive gilt der Dateipfad in
 * beiden Sprachen, DE mit /de-Präfix (prefix_except_default).
 */
function urlsForPage(rel: string, source: string): PageUrls[] {
  const call = source.match(/defineI18nRoute\(\s*\{\s*paths:\s*\{([\s\S]*?)\}/)
  let en: string
  let dePath: string
  if (call) {
    const enPath = call[1].match(/en:\s*'([^']+)'/)?.[1]
    const deOwn = call[1].match(/de:\s*'([^']+)'/)?.[1]
    if (!enPath || !deOwn)
      throw new Error(`${rel}: defineI18nRoute ohne en- oder de-Pfad — Regex oder Seite prüfen`)
    en = enPath
    dePath = deOwn
  }
  else {
    let derived = `/${rel.replace(/\.vue$/, '')}`
    if (derived === '/index')
      derived = '/'
    en = derived
    dePath = derived === '/' ? '' : derived
  }
  const de = dePath === '' ? '/de' : `/de${dePath}`

  if (!en.includes('[slug]'))
    return [{ file: rel, en, de }]

  const guards = DYNAMIC_GUARDS.filter(guard => guard.pattern.test(source))
  if (guards.length !== 1) {
    throw new Error(
      `${rel}: erwartet GENAU EINEN bekannten 404-Guard (gefunden: ${guards.map(g => g.name).join(', ') || 'keiner'}) — neue Guard-Form in DYNAMIC_GUARDS eintragen`,
    )
  }
  const guard = guards[0]
  return guard.en.map((enSlug, i) => ({
    file: rel,
    en: en.replace('[slug]', enSlug),
    de: de.replace('[slug]', guard.de[i]),
  }))
}

const pageEntries: PageUrls[] = readdirSync(PAGES_DIR, { recursive: true })
  .map(String)
  .filter(file => file.endsWith('.vue') && !NOINDEX_PAGES.has(file))
  .sort()
  .flatMap(file => urlsForPage(file, readFileSync(join(PAGES_DIR, file), 'utf8')))

/** Trifft eine routeRules-Quelle ('/x/**' als Präfix, sonst exakt) diese URL? */
function redirectSourceHits(source: string, url: string): boolean {
  if (source.endsWith('/**')) {
    const prefix = source.slice(0, -'/**'.length)
    return url === prefix || url.startsWith(`${prefix}/`)
  }
  return url === source
}

describe('sitemap ↔ Seiten (Route-Vergleich)', () => {
  it('jede Seite steht in der Sitemap — en und de als Paar desselben Schlüssels', () => {
    const byEn = new Map(MARKETING_ROUTES.map(route => [route.en, route]))
    for (const page of pageEntries) {
      const route = byEn.get(page.en)
      expect(route, `Seite ${page.file} fehlt in MARKETING_ROUTES: ${page.en}`).toBeDefined()
      expect(route?.de, `Seite ${page.file} (${page.en}): DE-Pfad weicht ab`).toBe(page.de)
    }
  })

  it('jede Sitemap-URL trägt eine Seite', () => {
    const enUrls = new Set(pageEntries.map(page => page.en))
    const deUrls = new Set(pageEntries.map(page => page.de))
    for (const route of MARKETING_ROUTES) {
      expect(enUrls.has(route.en), `Sitemap-Eintrag ohne Seite: ${route.en}`).toBe(true)
      expect(deUrls.has(route.de), `Sitemap-Eintrag ohne Seite: ${route.de}`).toBe(true)
    }
  })

  it('keine Sitemap-URL liegt unter einer Redirect-Quelle aus routeRules', () => {
    const nuxtConfig = readFileSync(join(APP_ROOT, 'nuxt.config.ts'), 'utf8')
    const sources = [...nuxtConfig.matchAll(/'(\/[^']*)':\s*\{\s*redirect:/g)].map(m => m[1])
    // Regex-Netz: verschwinden die Treffer, hat sich das routeRules-Format
    // geändert und der Test prüft sonst still nichts mehr.
    expect(sources.length, 'keine routeRules-Redirects gefunden — Regex an nuxt.config.ts anpassen').toBeGreaterThan(0)
    for (const route of MARKETING_ROUTES) {
      for (const url of [route.en, route.de]) {
        const hit = sources.find(source => redirectSourceHits(source, url))
        expect(hit, `${url} leitet per routeRules ('${hit}') weiter — die Sitemap darf nur Zieladressen anbieten`).toBeUndefined()
      }
    }
  })

  it('keine doppelten Einträge', () => {
    for (const locale of ['en', 'de'] as const) {
      const urls = MARKETING_ROUTES.map(route => route[locale])
      const seen = new Set<string>()
      for (const url of urls) {
        expect(seen.has(url), `doppelter Sitemap-Eintrag: ${url}`).toBe(false)
        seen.add(url)
      }
    }
  })
})
