/**
 * Feature Layer: Media — generische Bild-Galerie (Table `media_items` +
 * Bucket `media`, Migration media-001; eigener Schema-Owner nach A14).
 * Erster komplett Manifest-geborener Layer (M5/P1). Extended den Core NICHT
 * selbst — die App komponiert beide: extends: [media, …, core].
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
