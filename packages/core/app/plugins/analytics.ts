import { ANALYTICS_PROXY_EVENT_PATH, plausibleProxyScriptPath, plausibleScriptUrl } from '../../shared/analyticsScript'

/**
 * Analytics mit doppeltem Gate (Konzept A5):
 *   1. pukalani.analytics.enabled — App muss explizit aktivieren
 *   2. pukalani.consent.enabled  — wenn an, lädt das Script NUR nach Zustimmung
 *
 * Universal (nicht .client), damit der Script-Tag bei vorhandenem Consent
 * schon im SSR-HTML steht. Ohne Gate wird KEIN Byte Analytics geladen.
 *
 * ZWEI HERKÜNFTE FÜR EINE SCRIPT-ADRESSE (2026-08-04):
 *  - STATISCH (`src`/`domain` in der App-Config): Betreiber-Seiten mit genau
 *    einer Plausible-Site — marketing, comments, portfolio.
 *  - SELBSTBEDIENUNG (`instance` gesetzt): die Community schaltet die Messung
 *    im Dashboard ein, die App holt die Id beim Seitenaufbau (Layer
 *    `analytics`). Für den Pool ist das die einzige Möglichkeit — eine GEBAUTE
 *    Config kann nicht pro Host eine andere Site nennen. WELCHE Id dabei
 *    herauskommt — die eigene Site der Community oder die Sammel-Site des
 *    Deployments (`pukalani.analytics.shared`) — entscheidet allein die Route;
 *    hier ist es einfach „die Id dieses Hosts" (shared/analyticsScript.ts,
 *    `effectiveScriptId`).
 * Ist beides da, GEWINNT DIE ZEILE DER COMMUNITY: sie ist die spezifischere
 * Aussage („diese Community misst hier"), die Config nur die Voreinstellung
 * des Deployments.
 */
export default defineNuxtPlugin(async () => {
  const appConfig = useAppConfig()
  const analytics = appConfig.pukalani?.analytics

  if (analytics?.enabled !== true) return

  /**
   * Die Script-Id des aktuellen Hosts — EINMAL im SSR geholt und über den
   * Payload an den Browser gereicht (`useState`). Der Client rechnet damit
   * dasselbe Ergebnis wie der Server: kein zweiter Abruf, kein
   * Hydration-Unterschied.
   *
   * WARUM NICHT im Consent-Watcher unten: der läuft außerhalb des
   * Nuxt-Kontexts, dort gäbe es weder `useState` noch `useRequestFetch`.
   *
   * WARUM `useRequestFetch()` UND NICHT `$fetch`: der server-seitige `$fetch`
   * reicht die Kopfzeilen des Requests NICHT weiter — ohne `Host` löst die
   * Mandanten-Middleware den falschen (oder gar keinen) Mandanten auf, und die
   * Antwort wäre die Script-Id einer fremden Community.
   *
   * FAIL-SOFT: jeder Fehler (Layer nicht montiert, Kontroll-Host, Appwrite
   * schweigt) heißt „keine Id" — dann wird eben nichts gemessen. Eine Statistik
   * darf keine Seite kosten.
   */
  const selfServiceId = useState<string>('pukalani-analytics-script-id', () => '')
  if (analytics.instance && import.meta.server) {
    try {
      const requestFetch = useRequestFetch()
      const config = await requestFetch<{ scriptId?: string }>('/api/analytics/config')
      selfServiceId.value = typeof config?.scriptId === 'string' ? config.scriptId : ''
    }
    catch {
      selfServiceId.value = ''
    }
  }
  /**
   * ADBLOCK-PROXY (F47): mit `proxy: true` wird das Script RELATIV vom eigenen
   * Host geladen und die Events gehen per `init({ endpoint })` an denselben
   * Host — die beiden Routen dazu bringt der Layer `analytics` mit. Sonst wie
   * gehabt die absolute Adresse der Instanz. Beide Wege rechnen mit derselben
   * geprüften Id — die Vorschau im Dashboard zeigt weiterhin die
   * Instanz-Adresse, denn GEMESSEN wird in beiden Fällen in dieselbe Site.
   */
  const proxied = analytics.proxy === true
  const selfServiceSrc = proxied
    ? plausibleProxyScriptPath(selfServiceId.value)
    : plausibleScriptUrl(analytics.instance, selfServiceId.value)

  const consentRequired = appConfig.pukalani?.consent?.enabled === true
  const { hasConsent } = useCookieConsent()

  function loadScript() {
    if (analytics.provider === 'umami') {
      useHead({
        script: [{
          'src': analytics.src || 'https://cloud.umami.is/script.js',
          'data-website-id': analytics.websiteId,
          'defer': true,
        }],
      })
      return
    }

    if (selfServiceSrc || analytics.snippet === 'v3') {
      // Plausible-v3-Snippet: das Site-Script (pa-…) trägt die Zuordnung in
      // der URL, getrackt wird erst durch den expliziten init()-Aufruf.
      // SPA-Navigationen zählt das Script selbst (History-API).
      //
      // Beim Adblock-Proxy (F47) bekommt init() den Event-Endpunkt auf dem
      // EIGENEN Host mit — sonst schickte das first-party geladene Script
      // seine Events weiter an die (blockbare) Instanz-Adresse. Der Wert ist
      // eine Konstante aus shared/analyticsScript.ts, nie eine Eingabe.
      const initArg = proxied && selfServiceSrc
        ? JSON.stringify({ endpoint: ANALYTICS_PROXY_EVENT_PATH })
        : ''
      useHead({
        script: [
          { src: selfServiceSrc || analytics.src, async: true },
          { innerHTML: `window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init(${initArg})` },
        ],
      })
      return
    }

    /**
     * NICHTS ZU MESSEN, ALSO NICHTS ZU LADEN. Ohne diese Zeile fiele eine App
     * im Selbstbedienungs-Modus (enabled + instance, aber ohne hinterlegte Id)
     * in den Legacy-Zweig darunter und lüde `plausible.io` mit einem LEEREN
     * data-domain — ein Fremd-Script auf jeder Seite jeder Community, das
     * nichts misst.
     */
    if (!analytics.src && !analytics.domain) return

    useHead({
      script: [{
        'src': analytics.src || 'https://plausible.io/js/script.js',
        'data-domain': analytics.domain,
        'defer': true,
      }],
    })
  }

  if (!consentRequired || hasConsent.value) {
    loadScript()
    return
  }

  // Consent steht noch aus — clientseitig auf die Zustimmung warten
  if (import.meta.client) {
    const stop = watch(hasConsent, (value) => {
      if (value) {
        loadScript()
        stop()
      }
    })
  }
})
