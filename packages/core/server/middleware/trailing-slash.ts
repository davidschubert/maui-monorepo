/**
 * Kanonische URLs OHNE Trailing Slash: /pfad/ -> /pfad (301), Query bleibt erhalten.
 * Verhindert Duplicate Content (beide Formen lieferten sonst je 200).
 *
 * Ausgenommen (werden NICHT umgeleitet):
 * - Root '/' (ist per Definition immer mit Slash)
 * - /api/* (Server-Routen — ein 301 würde u. a. POST-Methoden gefährden)
 * - /_* (interne Pfade: /_nuxt, /_ipx, /__nuxt_devtools__ …)
 * - Dateien (Punkt im letzten Segment: /sitemap.xml, /robots.txt …)
 */
export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const path = url.pathname

  if (path.length <= 1 || !path.endsWith('/')) return

  const lastSegment = path.replace(/\/+$/, '').split('/').pop() ?? ''
  if (path.startsWith('/api') || path.startsWith('/_') || lastSegment.includes('.')) return

  return sendRedirect(event, path.replace(/\/+$/, '') + url.search, 301)
})
