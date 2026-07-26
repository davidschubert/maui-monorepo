/**
 * Trennt die zwei Welten DESSELBEN Deployments, symmetrisch:
 *
 *  - Auf einem KONTROLL-Host (app.pukalani.app) zeigt `/` den Trichter, nicht
 *    die Startseite einer Community — dort gibt es keine.
 *  - Auf einem Community-Host bleibt der Trichter unerreichbar (404). Ein
 *    „Community anlegen" unter `kunde.pukalani.app/start` wäre für Mitglieder
 *    verwirrend und würde suggerieren, es hätte etwas mit dieser Community zu tun.
 *
 * Serverseitig hängt die Grenze nicht an dieser Middleware, sondern an
 * 00.tenant.ts + 01.control-center.ts — das hier ist die Navigations-Hälfte.
 */
export default defineNuxtRouteMiddleware((to) => {
  const isControlCenter = useIsControlCenter()
  const localePath = useLocalePath()
  // Pfad ohne Locale-Prefix vergleichen (prefix_except_default: /start und /de/start)
  const path = to.path.replace(/^\/(de|en)(?=\/|$)/, '') || '/'

  if (isControlCenter) {
    // Query MITNEHMEN: der Direktlink aus der Einladungs-Mail ist
    // `https://start.pukalani.app?code=…`. Ohne das fiele der Code beim
    // Weiterleiten weg und der Eingeladene müsste ihn abtippen.
    if (path === '/') return navigateTo({ path: localePath('/start'), query: to.query })
    return
  }

  if (path === '/start' || path.startsWith('/start/')) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
})
