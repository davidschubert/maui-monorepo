/**
 * CSRF-Origin-Check (Embed-Vorarbeit E0, § 3b des Embed-Plans): Sobald eine
 * App das partitionierte Embed-Session-Cookie (SameSite=None) einführt,
 * schützt sameSite nicht mehr vor cross-site Form-POSTs — dann MUSS dieser
 * Check aktiv sein (maui.security.csrfOriginCheck: true).
 *
 * Prüft unsichere Methoden auf /api/*: `Sec-Fetch-Site: cross-site` → 403;
 * ohne Sec-Fetch-Site entscheidet der Origin-Header gegen den Request-Host.
 * Requests OHNE Origin (Server-zu-Server, z. B. Stripe-Webhook, curl) passieren
 * — sie tragen kein Browser-Cookie und sind kein CSRF-Vektor.
 * Default aus (no-op): same-site-Cookies schützen die Haupt-App bereits.
 */
export default defineEventHandler((event) => {
  const method = event.method
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') return

  const appConfig = useAppConfig(event) as { maui?: { security?: { csrfOriginCheck?: boolean } } }
  if (!appConfig.maui?.security?.csrfOriginCheck) return

  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/')) return

  const secFetchSite = getHeader(event, 'sec-fetch-site')
  if (secFetchSite === 'cross-site') {
    throw createError({ status: 403, statusText: 'Cross-site request rejected' })
  }
  if (secFetchSite) return // same-origin | same-site | none → ok

  const origin = getHeader(event, 'origin')
  if (!origin) return // kein Browser-Kontext → kein CSRF-Vektor

  try {
    if (new URL(origin).host !== url.host) {
      throw createError({ status: 403, statusText: 'Cross-site request rejected' })
    }
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    // Unparsebarer Origin (z. B. 'null' bei sandboxed iframes) → ablehnen
    throw createError({ status: 403, statusText: 'Cross-site request rejected' })
  }
})
