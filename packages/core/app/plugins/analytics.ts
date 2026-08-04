import { plausibleScriptUrl } from '../../shared/analyticsScript'

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
 *  - SELBSTBEDIENUNG (`instance` gesetzt): die Community trägt ihre Script-Id
 *    im Dashboard ein, die App holt sie beim Seitenaufbau (Layer `analytics`).
 *    Für den Pool ist das die einzige Möglichkeit — eine GEBAUTE Config kann
 *    nicht pro Host eine andere Site nennen.
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
  // Dieselbe Funktion, die auch die Vorschau im Dashboard baut — die beiden
  // können damit gar nicht auseinanderlaufen.
  const selfServiceSrc = plausibleScriptUrl(analytics.instance, selfServiceId.value)

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
      useHead({
        script: [
          { src: selfServiceSrc || analytics.src, async: true },
          { innerHTML: 'window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()' },
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
