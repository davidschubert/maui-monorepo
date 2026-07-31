/**
 * Der Seiten-Kopf jeder Marketing-Seite: Titel, Beschreibung, Open Graph und
 * die Twitter-Karte — EIN Aufruf statt acht Kopien desselben `useSeoMeta`.
 *
 * WAS HIER NICHT HINEINGEHÖRT: canonical, hreflang, og:url, og:locale und
 * lang/dir. Die kommen aus `useLocaleSeoHead()` (Core), einmalig in der
 * `app.vue`. Diese beiden Köpfe teilen sich die Seite bewusst — der Core kennt
 * die Sprach-Alternativen, die App kennt ihre Texte und ihr Bild.
 *
 * WARUM ES DIESES COMPOSABLE GIBT: acht Seiten hielten dieselben zehn Zeilen,
 * und Kopien altern verschieden. Auf vier von ihnen (faq, glossar, dsgvo,
 * wechseln) fehlte `twitter:card` — dieselben Bilder, halbe Wirkung, weil X
 * ohne die Zeile eine kleine quadratische Kachel zeigt statt der breiten
 * Karte. Die Maße fehlten überall: ohne sie holt ein Vorschau-Dienst das Bild
 * erst, misst es und entscheidet dann, ob er die große Karte zeigt — steht das
 * Format im Kopf, rendert die Vorschau sofort und richtig.
 *
 * Titel und Beschreibung kommen als i18n-SCHLÜSSEL, nicht als fertiger Text:
 * die dynamischen Seiten (produkte/use-cases/vs) bauen ihren Schlüssel aus dem
 * Slug (`marketing.vs.items.circle.metaTitle`), und `useSeoMeta` braucht die
 * Übersetzung als Funktion, damit ein Sprachwechsel den Kopf mitnimmt.
 */

/** Maße der committeten OG-Bilder (public/og/*.jpg, scripts/og-images.mjs). */
const OG_IMAGE_WIDTH = 1200
const OG_IMAGE_HEIGHT = 630
const OG_IMAGE_TYPE = 'image/jpeg'

export interface MarketingSeoOptions {
  /**
   * i18n-Schlüssel des Seitentitels (steht auch als og:title).
   */
  titleKey: string
  /**
   * i18n-Schlüssel der Beschreibung (steht auch als og:description).
   */
  descriptionKey: string
  /**
   * Name des seiteneigenen OG-Bilds ohne Sprach-Suffix und Endung —
   * `public/og/<image>-<locale>.jpg`.
   */
  image: string
  /**
   * `og:type`. Vorgabe `article`, weil das für jede Unterseite gilt; nur die
   * Startseite ist die `website`.
   */
  type?: 'website' | 'article'
}

export function useMarketingSeo(options: MarketingSeoOptions): void {
  const { t } = useI18n()
  const ogImage = useOgImage(options.image)

  useSeoMeta({
    title: () => t(options.titleKey),
    description: () => t(options.descriptionKey),
    ogTitle: () => t(options.titleKey),
    ogDescription: () => t(options.descriptionKey),
    ogType: options.type ?? 'article',
    ogSiteName: 'Pukalani',
    ogImage: () => ogImage.value,
    ogImageWidth: OG_IMAGE_WIDTH,
    ogImageHeight: OG_IMAGE_HEIGHT,
    ogImageType: OG_IMAGE_TYPE,
    twitterImage: () => ogImage.value,
    // Ohne diese Zeile zeigt X dasselbe Bild als kleine quadratische Kachel.
    twitterCard: 'summary_large_image',
  })
}
