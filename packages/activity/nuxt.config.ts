/**
 * Feature Layer: Activity Feed — die UI-Welt zum Core-Vertrag recordActivity()
 * (Table `activities` gehört system, Migration 014; A14-Matrix wie bei themes).
 * Extended den Core NICHT selbst — die App komponiert beide:
 * extends: [activity, …, core].
 *
 * NICHT POOL-FÄHIG (Stand S3): `activities` trägt KEINE tenantId. Der
 * Autorisierungs-Gate ist bereits `requireSitePermission`, aber die DATEN-Tür
 * fehlt — vor dem ersten Einsatz in apps/platform braucht die Table eine
 * tenantId-Migration + Umstellung auf tenantDb(), sonst löscht ein Site-Admin
 * Feed-Einträge fremder Mandanten.
 */
export default defineNuxtConfig({
  // Eigene Layer-Strings — mergen mit Core- und App-Locales (gleiche codes)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
