/**
 * Feature Layer: Studio — das Control Plane der Multi-Site-Plattform (M6):
 * Sites-Register (Table `sites`, Migration studio-001; eigener Schema-Owner
 * nach A14), Health-Übersicht, später Site-Erstellungs-Flow + Entitlements.
 * Läuft NUR in apps/studio (hawaii.studio) — besitzt bewusst KEINE
 * Site-Inhalte und keine Site-Sessions (Vertrauensgrenze, Strategie § 8).
 */
export default defineNuxtConfig({
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
