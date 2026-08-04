export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core). Core-Defaults sind
  // bewusst konservativ (analytics/consent aus, keine OAuth-Buttons) — die App
  // aktiviert explizit, was sie braucht:
  // pukalani: {
  //   analytics: true,
  //   consent: true,
  //   auth: { providers: ['github'], termsUrl: '/agb', otp: true },
  // }
  pukalani: {
    /**
     * Plausible (self-hosted, plausible.hawaii.studio) — cookielos, deshalb
     * kein Consent-Banner. v3-Snippet: die Site-Zuordnung zu
     * portfolio.pukalani.app steckt in der Script-Id (pa-…); Outbound-Links/
     * Downloads/Formulare sind serverseitig an der Id konfiguriert.
     */
    analytics: {
      enabled: true,
      provider: 'plausible' as const,
      snippet: 'v3' as const,
      src: 'https://plausible.hawaii.studio/js/pa-lXh3V4rHPB9Z2yPCDk6eK.js',
      /**
       * SELBSTBEDIENUNG (2026-08-04): erlaubt den Wechsel der Plausible-Site
       * unter /dashboard/analytics ohne Deployment. Eine dort hinterlegte
       * Script-Id schlägt das `src` oben; ohne Eintrag bleibt alles wie hier.
       */
      instance: 'https://plausible.hawaii.studio',
    },
  },
  ui: {},
})
