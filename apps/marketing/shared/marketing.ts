/**
 * Die Kataloge der Marketing-Site: Slug-Listen und Zählwerte, die der SERVER
 * (sitemap.xml, robots.txt) und die APP (Seiten, Sektionen) gleichermaßen
 * kennen müssen.
 *
 * WARUM shared/ UND NICHT JE SEITE: bis 2026-07-30 stand dieselbe Wahrheit an
 * bis zu drei Stellen — die Slug-Listen in `server/utils/marketingRoutes.ts`
 * UND in den [slug]-Seiten, die FAQ-Anzahl in `FaqSection.vue`, in `/faq` und
 * auf der Startseite. Wer eine Seite oder eine Frage ergänzt, ohne die
 * Zwillinge zu kennen, liefert eine Sitemap ohne die neue Seite oder ein
 * JSON-LD ohne die neue Antwort. Beides fällt niemandem auf, weil nichts
 * kaputtgeht — es fehlt nur. `shared/` sieht der Server UND die App
 * (CLAUDE.md: Domain-Wahrheit gehört dorthin), also gibt es die Liste einmal.
 *
 * Reihenfolge ist Inhalt: sie bestimmt die Reihenfolge in Navigation und
 * Sitemap. Neue Seite ⇒ Slug hier eintragen UND die Route in
 * `server/utils/marketingRoutes.ts` ergänzen (dort steht die Priorität).
 */

/** Die zwei Sprachen dieser Site (i18n-Strategie `prefix_except_default`, EN Default). */
export type MarketingLocale = 'de' | 'en'

/**
 * KANONISCHE Produkt-Schlüssel — die Identität eines Produkts, NICHT seine URL.
 * Reihenfolge = Reihenfolge in Navigation, Fuß und Sitemap.
 *
 * Der Schlüssel ist zufällig auch der deutsche Slug, und das ist Geschichte,
 * kein Prinzip: die Seiten wurden auf Deutsch gebaut. Alles, was an einem
 * Produkt hängt, hängt am SCHLÜSSEL und wird nie mit umbenannt —
 * i18n-Texte (`marketing.products.items.<key>`, `marketing.nav.products.items.
 * <key>`), die OG-Bilder (`public/og/products-<key>-<locale>.jpg`) und die
 * Early-Access-Liste unten. Nur die URL ist übersetzt.
 */
export const PRODUCT_KEYS = ['diskussionen', 'moderation', 'branding', 'beitraege', 'kurse', 'events'] as const

export type ProductKey = (typeof PRODUCT_KEYS)[number]

/**
 * Produkt-Seiten, LOKALISIERTE Slugs (Davids Entscheidung 2026-07-31):
 * EN `/products/<en>` · DE `/de/produkte/<de>`.
 *
 * Bis dahin war nur das SEGMENT übersetzt (`/products` ↔ `/produkte`) und der
 * Slug blieb in beiden Sprachen deutsch — ein englischer Besucher bekam
 * `/products/beitraege` und `/products/kurse`. Das ist keine Kosmetik: der
 * Slug ist der Teil der Adresse, den ein Mensch liest und den eine Suchmaschine
 * als Wort wertet.
 *
 * Drei Produkte heißen in beiden Sprachen gleich (moderation, branding,
 * events) — sie stehen trotzdem ausgeschrieben da, weil ein Eintrag mit nur
 * einer Sprache stillschweigend die andere erfände.
 *
 * `Record<ProductKey, …>` statt `as const`: so ERZWINGT der Typ einen Eintrag
 * je Schlüssel — ein neues Produkt ohne Übersetzung ist ein Typfehler und
 * keine 404-Überraschung.
 */
export const PRODUCT_SLUGS: Readonly<Record<ProductKey, Readonly<Record<MarketingLocale, string>>>> = {
  diskussionen: { de: 'diskussionen', en: 'discussions' },
  moderation: { de: 'moderation', en: 'moderation' },
  branding: { de: 'branding', en: 'branding' },
  beitraege: { de: 'beitraege', en: 'posts' },
  kurse: { de: 'kurse', en: 'courses' },
  events: { de: 'events', en: 'events' },
}

/**
 * Die Locale von @nuxtjs/i18n kommt als `string` (der Typ kennt beliebige
 * Codes). Diese Site hat genau zwei, und EN ist die Default-Locale — alles,
 * was nicht 'de' ist, ist hier also 'en'.
 */
export function marketingLocale(locale: string): MarketingLocale {
  return locale === 'de' ? 'de' : 'en'
}

/** Schlüssel → Slug DIESER Sprache (Link-Ziele, Sitemap). */
export function slugForLocale(key: ProductKey, locale: string): string {
  return PRODUCT_SLUGS[key][marketingLocale(locale)]
}

/**
 * Slug DIESER Sprache → Schlüssel; `undefined` heißt 404.
 *
 * Bewusst streng je Sprache: `/products/kurse` (deutscher Slug auf der
 * englischen Seite) ist KEIN Treffer, sondern eine alte Adresse — sie wird in
 * `nuxt.config.ts` per 301 auf `/products/courses` geschickt. Würde hier
 * beides gelten, gäbe es dieselbe Seite unter zwei URLs (Duplicate Content),
 * und die Weiterleitung käme nie zum Zug.
 */
export function keyFromSlug(slug: string, locale: string): ProductKey | undefined {
  const wanted = marketingLocale(locale)
  return PRODUCT_KEYS.find(key => PRODUCT_SLUGS[key][wanted] === slug)
}

/**
 * Bausteine, die noch NICHT im offenen Angebot sind (§2.4). Ihre Seiten
 * tragen den Early-Access-Banner und KEINEN Kauf-CTA.
 *
 * Am kanonischen SCHLÜSSEL, nicht am Slug: ein Claim-Gate darf nicht davon
 * abhängen, in welcher Sprache die Seite gerade aufgerufen wurde.
 */
export const EARLY_ACCESS_KEYS: readonly ProductKey[] = ['beitraege', 'kurse', 'events']

/** Vergleichsseiten: /vs/<slug> · /de/vs/<slug>. */
export const VS_SLUGS = ['circle', 'skool', 'mighty-networks'] as const

/** Anwendungsfall-Seiten: EIN Segment für beide Sprachen (/use-cases/<slug>). */
export const AUDIENCE_SLUGS = ['coaches', 'kurse', 'creator', 'vereine'] as const

/**
 * Anzahl der FAQ-Einträge (`marketing.faq.items.0…n-1` in beiden Locales).
 * Gelesen von `FaqSection.vue` (sichtbare Liste), `/faq` und der Startseite
 * (beide JSON-LD): das sichtbare Element und seine strukturierten Daten
 * MÜSSEN deckungsgleich sein — Google verlangt, dass eine ausgezeichnete
 * Antwort auch im Seiteninhalt steht.
 */
export const FAQ_COUNT = 6

export type VsSlug = (typeof VS_SLUGS)[number]
export type AudienceSlug = (typeof AUDIENCE_SLUGS)[number]
