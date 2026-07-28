/**
 * Feature Layer: Media — generische Bild-Galerie (Table `media_items` +
 * Bucket `media`, Migration media-001; eigener Schema-Owner nach A14).
 * Erster komplett Manifest-geborener Layer (M5/P1). Extended den Core NICHT
 * selbst — die App komponiert beide: extends: [media, …, core].
 *
 * POOL-FÄHIG seit C1b (2026-07-28): `media_items` trägt `tenantId`
 * (Migration media-003), ALLE server/api-Routen und applyMediaVisibility gehen
 * über die Datentür `tenantDb(event)`; der ESLint-Backstop verbietet rohes
 * `.tablesDB` in server/api und server/plugins. Autorisierung: S3
 * (`requireSitePermission`), Sichtbarkeit: media-002 (Row + Datei).
 *
 * OFFEN vor dem ersten Einsatz in apps/platform (kein Leck, aber eine Lücke):
 * Entwurfs-DATEIEN im Bucket `media` tragen nur den GLOBALEN Operator-Read
 * (`Role.label('admin')`) — im Pool könnte die Redaktion einer Kunden-Site ihre
 * eigenen Entwürfe nicht vorschauen. Begründung + Richtung (server-seitige
 * Vorschau-Route statt Site-Label) in server/utils/mediaPermissions.ts.
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
