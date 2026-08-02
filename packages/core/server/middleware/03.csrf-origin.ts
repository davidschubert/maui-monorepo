import { csrfOriginVerdict } from '../utils/csrfOrigin'

/**
 * CSRF-Origin-Check (Embed-Vorarbeit E0, § 3b des Embed-Plans): Sobald eine
 * App das partitionierte Embed-Session-Cookie (SameSite=None) einführt,
 * schützt sameSite nicht mehr vor cross-site Form-POSTs — dann MUSS dieser
 * Check aktiv sein (pukalani.security.csrfOriginCheck: true).
 *
 * Prüft unsichere Methoden auf /api/*. Die ENTSCHEIDUNG selbst ist pure und
 * steht mit ihrer Begründung in server/utils/csrfOrigin.ts — hier kommt nur
 * das Gate und das Auslesen der Header dazu. Default aus (no-op).
 */
export default defineEventHandler((event) => {
  const method = event.method
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') return

  const appConfig = useAppConfig(event) as { pukalani?: { security?: { csrfOriginCheck?: boolean } } }
  if (!appConfig.pukalani?.security?.csrfOriginCheck) return

  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/')) return

  const verdict = csrfOriginVerdict({
    secFetchSite: getHeader(event, 'sec-fetch-site'),
    origin: getHeader(event, 'origin'),
    host: url.host,
  })
  if (verdict === 'reject') {
    throw createError({ status: 403, statusText: 'Cross-site request rejected' })
  }
})
