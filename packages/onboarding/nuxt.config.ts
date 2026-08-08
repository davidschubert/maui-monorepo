/**
 * Produkt Layer: Onboarding — der öffentliche Trichter „Community in 60
 * Sekunden" (SAAS-ROADMAP #1). Lebt NUR in apps/platform und dort nur auf den
 * KONTROLL-Hosts (pukalani.tenancy.controlHosts, z. B. my.pukalani.app): dort gibt
 * es bewusst keinen Mandanten, weil hier erst einer entsteht.
 *
 * BESITZT KEINE Appwrite-Tables. Alles, was entsteht, gehört dem Control Plane
 * (communities/community_members) und wird über die auditierte Service-Naht
 * dort angelegt (POST /api/control/onboarding/site) — dieser Layer hält
 * ausschließlich die Oberfläche und den Aufruf.
 */
export default defineNuxtConfig({
  runtimeConfig: {
    // server-only! Dasselbe Geheimnis wie NUXT_CONTROL_ONBOARDING_SECRET im
    // Control Plane. Leer = der Trichter antwortet 503 (Fehlkonfiguration
    // sichtbar machen, statt still eine kaputte Seite zu zeigen).
    onboardingServiceSecret: '',
    // Basis-URL des Control Plane (z. B. https://control.pukalani.app).
    // Leer = 503. Env: NUXT_ONBOARDING_CONTROL_URL
    onboardingControlUrl: '',
  },

  /**
   * ALT-PFADE DES COMMUNITY-HUBS (F51, 2026-08-07). Fünf Flächen dieses Layers
   * sind an einen Ort gezogen; die alten Adressen stehen in Lesezeichen, in
   * verschickten Mails (`PAST_DUE_NOTICE_LINK`) und — der teuerste Fall — in
   * bereits eröffneten Stripe-Checkout-Sitzungen, deren Rücksprung-URL beim
   * Anlegen eingefroren wurde. Ein 301 kostet nichts und fängt alle drei.
   *
   * JE ZWEIMAL, weil die i18n-Strategie `prefix_except_default` heißt: `en` ist
   * ohne Prefix erreichbar, `de` unter `/de/*`. Eine routeRule kennt keine
   * Locales — sie sieht nur den Pfad, und der ist ein anderer.
   *
   * Nitro-seitig, also nur für echte Requests (Lesezeichen, Rücksprünge). Für
   * die Navigation IM Dashboard gibt es die alten Pfade nirgends mehr; jeder
   * interne Verweis wurde mit umgezogen.
   */
  routeRules: {
    '/dashboard/settings/community': { redirect: { to: '/dashboard/community', statusCode: 301 } },
    '/de/dashboard/settings/community': { redirect: { to: '/de/dashboard/community', statusCode: 301 } },
    '/dashboard/branding': { redirect: { to: '/dashboard/community/branding', statusCode: 301 } },
    '/de/dashboard/branding': { redirect: { to: '/de/dashboard/community/branding', statusCode: 301 } },
    '/dashboard/members': { redirect: { to: '/dashboard/community/members', statusCode: 301 } },
    '/de/dashboard/members': { redirect: { to: '/de/dashboard/community/members', statusCode: 301 } },
    '/dashboard/settings/domain': { redirect: { to: '/dashboard/community/domain', statusCode: 301 } },
    '/de/dashboard/settings/domain': { redirect: { to: '/de/dashboard/community/domain', statusCode: 301 } },
    '/dashboard/settings/subscription': { redirect: { to: '/dashboard/community/plan', statusCode: 301 } },
    '/de/dashboard/settings/subscription': { redirect: { to: '/de/dashboard/community/plan', statusCode: 301 } },
  },

  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
