/**
 * Absolute URL des seiteneigenen OG-Bilds (public/og/<name>-<locale>.jpg,
 * erzeugt von scripts/og-images.mjs).
 *
 * Absolut, weil relative og:image-Pfade von einigen Crawlern nicht aufgelöst
 * werden. Die Basis kommt aus useSiteBaseUrl() — derselben Quelle wie
 * Canonical/hreflang, damit Vorschaubild und Canonical nie auf verschiedene
 * Hosts zeigen.
 */
export function useOgImage(name: string) {
  const { locale } = useI18n()
  const base = useSiteBaseUrl()
  return computed(() => `${base}/og/${name}-${locale.value}.jpg`)
}
