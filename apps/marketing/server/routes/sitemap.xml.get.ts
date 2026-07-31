import { MARKETING_ROUTES, marketingBaseUrl } from '../utils/marketingRoutes'

/**
 * sitemap.xml — bewusst als schlanke Server-Route statt per Extra-Modul
 * (§5: Module sind bewusste Abhängigkeiten; hier ist eine Liste + 20 Zeilen
 * XML ehrlicher als ein Generator).
 *
 * Jede URL trägt ihre hreflang-Alternates (xhtml:link), damit Google die
 * EN/DE-Paare erkennt — inklusive der locale-eigenen Pfade (/gdpr ↔ /de/dsgvo).
 * `lastmod` bleibt bewusst WEG: ein erfundenes Datum ist schlechter als keins.
 */
export default defineEventHandler((event) => {
  const base = marketingBaseUrl(event)

  const urls = MARKETING_ROUTES.flatMap((route) => {
    const enUrl = `${base}${route.en === '/' ? '' : route.en}`
    const deUrl = `${base}${route.de}`
    const alternates = [
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${enUrl}"/>`,
      `    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}"/>`,
      `    <xhtml:link rel="alternate" hreflang="de" href="${deUrl}"/>`,
    ].join('\n')

    return [enUrl, deUrl].map(loc => [
      '  <url>',
      `    <loc>${loc}</loc>`,
      alternates,
      `    <priority>${route.priority.toFixed(1)}</priority>`,
      '  </url>',
    ].join('\n'))
  })

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  // Öffentlich + user-agnostisch → darf ruhig am Edge/Proxy liegen.
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return xml
})
