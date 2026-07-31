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

/** Produkt-Seiten: EN /products/<slug> · DE /de/produkte/<slug>. */
export const PRODUCT_SLUGS = ['diskussionen', 'moderation', 'branding', 'beitraege', 'kurse', 'events'] as const

/**
 * Bausteine, die noch NICHT im offenen Angebot sind (§2.4). Ihre Seiten
 * tragen den Early-Access-Banner und KEINEN Kauf-CTA.
 *
 * Bewusst `readonly string[]` und nicht `as const`: die Liste wird gegen einen
 * beliebigen Slug aus der URL geprüft (`includes(slug)`), und ein Literal-Typ
 * verlangte dort einen Cast, der die Prüfung gerade aushebelte.
 */
export const EARLY_ACCESS_SLUGS: readonly string[] = ['beitraege', 'kurse', 'events']

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

export type ProductSlug = (typeof PRODUCT_SLUGS)[number]
export type VsSlug = (typeof VS_SLUGS)[number]
export type AudienceSlug = (typeof AUDIENCE_SLUGS)[number]
