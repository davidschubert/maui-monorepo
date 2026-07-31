import { marketingBaseUrl } from '../utils/marketingRoutes'

/**
 * robots.txt — alles erlaubt (die Marketing-Site SOLL gefunden werden), plus
 * Sitemap-Verweis. `/api/` wird ausgenommen: die Health-/Telemetrie-Routen der
 * Layer haben in einem Index nichts zu suchen.
 */
export default defineEventHandler((event) => {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${marketingBaseUrl(event)}/sitemap.xml`,
    '',
  ].join('\n')

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return body
})
