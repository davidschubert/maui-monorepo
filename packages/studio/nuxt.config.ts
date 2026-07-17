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
  },
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
