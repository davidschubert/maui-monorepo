/**
 * Produkt Layer: Media — generische Bild-Galerie (Table `media_items` +
 * Bucket `media`, Migration media-001; eigener Schema-Owner nach A14).
 * Erster komplett Manifest-geborener Layer (M5/P1). Extended den Core NICHT
 * selbst — die App komponiert beide: extends: [media, …, core].
 *
 * POOL-FÄHIG seit C1b (2026-07-28): `media_items` trägt `tenantId`
 * (Migration media-003), ALLE server/api-Routen und applyMediaVisibility gehen
 * über die Datentür `tenantDb(event)`; der ESLint-Backstop verbietet rohes
 * `.tablesDB` in server/api und server/plugins. Autorisierung: S3
 * (`requireCommunityPermission`), Sichtbarkeit: media-002 (Row + Datei).
 *
 * IM POOL MONTIERT seit 2026-08-02 (Davids Entscheidung) — apps/platform,
 * Produkt-Gate ab Plan personal (`requirePlanProduct(event, 'media')` an ALLEN
 * Routen, `planProduct` am Nav-Eintrag).
 *
 * GESCHLOSSEN BEIM UMZUG (F28, media-Hälfte): Entwurfs-DATEIEN tragen weiterhin
 * nur den GLOBALEN Operator-Read (`Role.label('admin')`, media-002) — das ist
 * richtig so, ein Site-Label würde Entwürfe allen MITGLIEDERN öffnen. Die
 * Vorschau in /dashboard/media läuft für Entwürfe deshalb seit dem Umzug über
 * `GET /api/media/:id/file` (Vorlage: /api/events/:id/cover); veröffentlichte
 * Kacheln bleiben auf der Bucket-URL. Ohne diesen Schritt hätte im Pool jede
 * Redaktion ihre eigenen Entwürfe als kaputte Bilder gesehen.
 *
 * MIGRATIONEN: `media_items` UND der Bucket `media` (media-001) — der Layer ist
 * der einzige, der auf einer neuen Instanz einen BUCKET anlegt. Der
 * Migrations-Schlüssel braucht dafür Storage-Rechte, der Laufzeit-Schlüssel
 * ebenso (F36). Reihenfolge + Rechte-Bedarf: docs/OPEN-ITEMS.md.
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
