/**
 * Feature Layer: Onboarding — der öffentliche Trichter „Community in 60
 * Sekunden" (SAAS-ROADMAP #1). Lebt NUR in apps/platform und dort nur auf den
 * KONTROLL-Hosts (maui.tenancy.controlHosts, z. B. app.pukalani.app): dort gibt
 * es bewusst keinen Mandanten, weil hier erst einer entsteht.
 *
 * BESITZT KEINE Appwrite-Tables. Alles, was entsteht, gehört dem Control Plane
 * (tenants/workspaces/site_members) und wird über die auditierte Service-Naht
 * dort angelegt (POST /api/control/onboarding/site) — dieser Layer hält
 * ausschließlich die Oberfläche und den Aufruf.
 */
export default defineNuxtConfig({
  runtimeConfig: {
    // server-only! Dasselbe Geheimnis wie NUXT_CONTROL_ONBOARDING_SECRET im
    // Control Plane. Leer = der Trichter antwortet 503 (Fehlkonfiguration
    // sichtbar machen, statt still eine kaputte Seite zu zeigen).
    onboardingServiceSecret: '',
    // Basis-URL des Control Plane (z. B. https://studio.pukalani.app).
    // Leer = 503. Env: NUXT_ONBOARDING_CONTROL_URL
    onboardingControlUrl: '',
  },
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
