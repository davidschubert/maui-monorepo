import type { H3Event } from 'h3'
import { hasCapability } from '../../../../packages/core/shared/authz'

/**
 * Türsteher der internen Projekt-Doku (/docs) — fail-closed.
 *
 * Die Doku ist INTERN. Sie hängt an der bestehenden Betreiber-Auth und ist
 * damit an ZWEI Stellen zu schützen, nicht an einer:
 *  1. die Seiten `/docs/**` (SSR) — sonst rendert der Server den Inhalt schon
 *     ins HTML, bevor die Client-Middleware zum Login umleiten könnte;
 *  2. die von @nuxt/content angemeldeten Routen `/__nuxt_content/**`:
 *     - `/__nuxt_content/<collection>/sql_dump.txt` = die KOMPLETTE Doku als
 *       SQL-Dump (der Browser lädt sie für die WASM-Datenbank),
 *     - `/__nuxt_content/<collection>/query` (POST) = freie Abfrage.
 *     Ohne diesen Zweig wäre der Bereich über die Content-API vollständig
 *     lesbar, obwohl die Seite umleitet.
 *
 * Der Guard verlässt sich BEWUSST nicht auf die Reihenfolge der Server-
 * Middleware: liegt `event.context.user` (core/server/middleware/auth.ts) noch
 * nicht vor, löst er die Session selbst auf. Autorität ist dieselbe wie beim
 * Dashboard: eine gültige Session MIT `dashboard.access`.
 *
 * Gast → Seite = Weiterleitung auf den Login (mit `?redirect=`), Content-API =
 * 401/403. In keinem Fall Inhalt.
 */

/** `/docs`, `/docs/...` — mit optionalem i18n-Locale-Prefix (`/de/docs/...`). */
const DOCS_PAGE_RE = /^(\/[a-z]{2})?\/docs(?:\/|$)/
const CONTENT_API_PREFIX = '/__nuxt_content/'

/**
 * Session-Auflösung wie core/server/middleware/auth.ts — wirft nie. Nur nötig,
 * wenn diese Middleware VOR der Core-Auth einsortiert wurde (Layer-Scan-
 * Reihenfolge ist nichts, worauf ein Sicherheits-Gate wetten sollte).
 */
async function resolveUser(event: H3Event) {
  if (event.context.user) return event.context.user
  if (!getCookie(event, sessionCookieName(event))) return undefined
  try {
    const { account } = createSessionClient(event)
    event.context.user = await account.get()
    return event.context.user
  }
  catch {
    return undefined
  }
}

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0] ?? ''
  const isContentApi = path.startsWith(CONTENT_API_PREFIX)
  const docsMatch = isContentApi ? null : DOCS_PAGE_RE.exec(path)
  if (!isContentApi && !docsMatch) return

  const user = await resolveUser(event)
  if (user && hasCapability(user.labels, 'dashboard.access')) return

  if (isContentApi) {
    throw user
      ? createError({ status: 403, statusText: 'Forbidden' })
      : createError({ status: 401, statusText: 'Unauthorized' })
  }

  // Angemeldet, aber ohne Betreiber-Recht: 403 statt Login-Karussell.
  if (user) throw createError({ status: 403, statusText: 'Forbidden' })

  // Gast bekommt den Login — mit demselben Locale-Prefix wie die Doku-URL,
  // damit die Weiterleitung nicht die Sprache verliert (localePath-Äquivalent).
  const localePrefix = docsMatch?.[1] ?? ''
  const target = `${localePrefix}/login?redirect=${encodeURIComponent(event.path)}`
  return sendRedirect(event, target, 302)
})
