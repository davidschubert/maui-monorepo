/**
 * Feature Layer: Studio — das Control Plane der Multi-Site-Plattform (M6):
 * Sites-Register (Table `sites`, Migration studio-001; eigener Schema-Owner
 * nach A14), Health-Übersicht, später Site-Erstellungs-Flow + Entitlements.
 * Läuft NUR in apps/studio (hawaii.studio) — besitzt bewusst KEINE
 * Site-Inhalte und keine Site-Sessions (Vertrauensgrenze, Strategie § 8).
 */
export default defineNuxtConfig({
  runtimeConfig: {
    // server-only! Aussteller-Schlüssel der Entitlement-Zustellung (F3):
    // Ed25519 PKCS8-DER base64 + kid — erzeugt scripts/entitlements-keygen.mjs.
    // Env: NUXT_ENTITLEMENTS_PRIVATE_KEY / NUXT_ENTITLEMENTS_KID.
    // Leer = GET /api/platform/entitlements/:projectId antwortet 503.
    entitlementsPrivateKey: '',
    entitlementsKid: '',
    // server-only! Service-Secret des Self-Service-Onboardings (SAAS-ROADMAP #1):
    // beweist, dass der Aufrufer von /api/studio/onboarding/* unser eigenes
    // Platform-Deployment ist. Env: NUXT_STUDIO_ONBOARDING_SECRET (dasselbe
    // Geheimnis dort als NUXT_ONBOARDING_SERVICE_SECRET).
    // LEER = die Onboarding-Routen existieren nicht (404) — Default-aus, damit
    // ein vergessenes Secret nicht in einen offenen Trichter mündet.
    studioOnboardingSecret: '',
    // Wohin die Einladungs-Mail verlinkt (Kundenbereich, nicht das Studio).
    // Env: NUXT_ONBOARDING_START_URL — Default zeigt auf die Prod-Adresse.
    onboardingStartUrl: 'https://app.pukalani.app/start',
    public: {
      // Laufzeit-Override des Pool-Projekts (Muster wie getEffectiveAiConfig:
      // app.config = Build-Default, Env = Umgebung). NÖTIG, weil das Pool-
      // Projekt pro Umgebung anders heißt — lokal 'reddit-comments', in Prod
      // 'pool'. Ein hartkodierter Default hätte lokal gegen ein nicht
      // existierendes Projekt provisioniert.
      // Env: NUXT_PUBLIC_STUDIO_POOL_PROJECT. Leer = app.config-Default.
      studioPoolProject: '',
    },
  },
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
