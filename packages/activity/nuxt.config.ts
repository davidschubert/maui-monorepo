/**
 * Produkt Layer: Activity Feed — die UI-Welt zum Core-Vertrag recordActivity()
 * (Table `activities` gehört system, Migration 014; A14-Matrix wie bei themes).
 * Extended den Core NICHT selbst — die App komponiert beide:
 * extends: [activity, …, core].
 *
 * POOL-FÄHIG seit C1b (2026-07-28): `activities` trägt `tenantId`
 * (Migration system-021 — die Table gehört system, A14), beide server/api-
 * Routen gehen über die Datentür `tenantDb(event)`, und recordActivity() (core)
 * stempelt Mandant + tenant-genamete Row-Permissions. Der Realtime-Stream
 * filtert zusätzlich clientseitig (useTenantId) — er liest direkt gegen
 * Appwrite, an ihm greift keine Server-Tür. Autorisierung: S3
 * (`requireSitePermission`).
 *
 * BESTAND auf der Pool-Instanz (platform) trägt keine tenantId und ist im Pool
 * daher unsichtbar (fail-closed) — folgenlos, solange `activity` nicht in
 * apps/platform/site.manifest.ts steht. Wer den Feed dort einschaltet,
 * entscheidet vorher über Backfill oder Wegwerfen (siehe system-021).
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
