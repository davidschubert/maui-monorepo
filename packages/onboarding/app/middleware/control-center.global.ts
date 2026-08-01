/**
 * Trennt die zwei Welten DESSELBEN Deployments, symmetrisch:
 *
 *  - Auf einem KONTROLL-Host (my./start.pukalani.app) zeigt `/` den
 *    Kundenbereich, nicht die Startseite einer Community — dort gibt es keine.
 *  - Auf einem Community-Host bleiben Trichter UND Übersicht unerreichbar
 *    (404). Ein „Community anlegen" unter `kunde.pukalani.app/start` wäre für
 *    Mitglieder verwirrend und würde suggerieren, es hätte etwas mit dieser
 *    Community zu tun; eine Liste FREMDER Communities unter
 *    `kunde.pukalani.app/communities` wäre Betreiber-Inhalt am falschen Ort
 *    (dieselbe Regel wie beim Changelog, N7).
 *
 * WOHIN `/` auf einem Kontroll-Host führt, entscheidet seit F12 eine pure
 * Funktion (`controlHomeTarget`, core/shared/controlCenter.ts): auf `start.*`
 * der Wizard, sonst die Übersicht — und ein `?code=` schlägt beides. Vorher
 * ging JEDER Kontroll-Host hart nach `/start`; ein Bestandskunde wurde damit
 * auf seinem eigenen Kundenbereich mit „Neue Community anlegen" begrüßt.
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
    if (path === '/') {
      const hasInviteCode = typeof to.query.code === 'string' && to.query.code.trim() !== ''
      const target = useControlHomeTarget(hasInviteCode) === 'wizard' ? '/start' : '/communities'
      // Query MITNEHMEN: der Direktlink aus der Einladungs-Mail ist
      // `https://start.pukalani.app?code=…`. Ohne das fiele der Code beim
      // Weiterleiten weg und der Eingeladene müsste ihn abtippen.
      return navigateTo({ path: localePath(target), query: to.query })
    }
    return
  }

  if (path === '/start' || path.startsWith('/start/') || path === '/communities') {
    throw createError({ status: 404, statusText: 'Not found' })
  }
})
