/**
 * Analytics mit doppeltem Gate (Konzept A5):
 *   1. maui.analytics.enabled — App muss explizit aktivieren
 *   2. maui.consent.enabled  — wenn an, lädt das Script NUR nach Zustimmung
 *
 * Universal (nicht .client), damit der Script-Tag bei vorhandenem Consent
 * schon im SSR-HTML steht. Ohne Gate wird KEIN Byte Analytics geladen.
 */
export default defineNuxtPlugin(() => {
  const appConfig = useAppConfig()
  const analytics = appConfig.maui?.analytics

  if (analytics?.enabled !== true) return

  const consentRequired = appConfig.maui?.consent?.enabled === true
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
