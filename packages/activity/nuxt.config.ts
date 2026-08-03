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
 * (`requireCommunityPermission`).
 *
 * IM POOL MONTIERT seit 2026-08-02 (Davids Entscheidung) — apps/platform.
 *
 * ALT-ZEILEN BLEIBEN UNSICHTBAR, und das ist die getroffene Entscheidung, kein
 * Versehen. system-021 hat sie ausdrücklich offengelassen („Backfill über die
 * Objekte oder Alt-Einträge wegwerfen"); gewählt ist das Wegwerfen, aus drei
 * Gründen:
 *  1. NICHT ZUZUORDNEN, ohne für jede Zeile ihr Objekt nachzuschlagen — und
 *     für die Hälfte der Typen ginge es gar nicht: `user.joined` hat kein
 *     Objekt, `milestone` auch nicht, und wegmoderierte Objekte sind weg.
 *  2. IHRE PERMISSIONS SIND ZU WEIT für einen Pool. Vor C1b entstanden sie mit
 *     `read("users")` — im Pool heißt das JEDER eingeloggte Nutzer ALLER
 *     Communities. Sie nur zu STEMPELN würde sie in einen Community-Feed holen
 *     und dabei pool-weit lesbar lassen; das wäre schlechter als unsichtbar.
 *     (Lesbar sind sie per Roh-REST heute schon — das MONTIEREN macht daran
 *     nichts besser und nichts schlechter, es holt sie nur nicht nach vorn.)
 *  3. EIN FEED IST EIN STROM. Was vor dem Einschalten passiert ist, fehlt
 *     niemandem; ab dem ersten neuen Ereignis ist er vollständig.
 * `recordActivity()` stempelt seit C1b communityId UND das richtige Publikum
 * (Role.label(communityId) im Pool) — NEUE Zeilen sind also von der ersten an
 * korrekt. Nachmessen (Anzahl + Publikum der Alt-Zeilen einer Instanz):
 * `scripts/verify-pool-isolation.mjs`, Abschnitt „Bestand".
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
