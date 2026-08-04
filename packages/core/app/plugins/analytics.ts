/**
 * Analytics mit doppeltem Gate (Konzept A5):
 *   1. pukalani.analytics.enabled — App muss explizit aktivieren
 *   2. pukalani.consent.enabled  — wenn an, lädt das Script NUR nach Zustimmung
 *
 * Universal (nicht .client), damit der Script-Tag bei vorhandenem Consent
 * schon im SSR-HTML steht. Ohne Gate wird KEIN Byte Analytics geladen.
 */
export default defineNuxtPlugin(() => {
  const appConfig = useAppConfig()
  const analytics = appConfig.pukalani?.analytics

  if (analytics?.enabled !== true) return

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
    }
    else if (analytics.snippet === 'v3') {
      // Plausible-v3-Snippet: das Site-Script (pa-…) trägt die Zuordnung in
      // der URL, getrackt wird erst durch den expliziten init()-Aufruf.
      // SPA-Navigationen zählt das Script selbst (History-API).
      useHead({
        script: [
          { src: analytics.src, async: true },
          { innerHTML: 'window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()' },
        ],
      })
    }
    else {
      useHead({
        script: [{
          'src': analytics.src || 'https://plausible.io/js/script.js',
          'data-domain': analytics.domain,
          'defer': true,
        }],
      })
    }
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
