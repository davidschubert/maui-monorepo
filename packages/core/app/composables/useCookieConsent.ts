export type ConsentValue = 'accepted' | 'declined'

/**
 * DSGVO-Consent-State, cookie-persistiert (SSR-lesbar).
 * Config-gated über pukalani.consent.enabled — ohne Gate kein Banner.
 */
export function useCookieConsent() {
  const consent = useCookie<ConsentValue | null>('pukalani-consent', {
    default: () => null,
    maxAge: 60 * 60 * 24 * 180,
    sameSite: 'lax',
  })

  const hasConsent = computed(() => consent.value === 'accepted')
  const needsDecision = computed(() => consent.value === null)

  function accept() {
    consent.value = 'accepted'
  }

  function decline() {
    consent.value = 'declined'
  }

  return { consent, hasConsent, needsDecision, accept, decline }
}
