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
     * SEO-BASIS AUS DEM REQUEST-HOST (control-036, 2026-08-07).
     *
     * Sobald diese Site eine eigene Domain hat, bedient DERSELBE Prozess zwei
     * Hosts — die Pukalani-Adresse und die Kundendomain. `i18n.baseUrl` ist
     * aber EINE Env pro App (`NUXT_PUBLIC_I18N_BASE_URL`): canonical, alle
     * hreflang-Alternates und og:url zeigten damit auf der neuen Domain
     * weiterhin auf die alte. Das ist wortwörtlich Audit-Befund B1, nur in
     * Silo-Gestalt — und es hiesse, dass Google die Kundendomain nicht
     * indexiert.
     *
     * Mit diesem Schalter kommen Host und Port aus dem Request und NUR das
     * Schema aus der Env (core/shared/seoOrigin.ts). Damit ist nach der
     * Freischaltung KEIN Handgriff in einer Env noetig: die vorhandene
     * `NUXT_PUBLIC_I18N_BASE_URL` liefert weiterhin `https` und darf so
     * stehen bleiben, wie sie ist.
     *
     * Gefahrlos, weil die Middleware des `domains`-Layers dafuer sorgt, dass
     * Seiten nur unter der kanonischen Adresse gerendert werden — jeder
     * andere bekannte Host leitet vorher um.
     */
    seo: { originFromRequest: true },
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
