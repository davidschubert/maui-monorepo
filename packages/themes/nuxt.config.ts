/**
 * Feature Layer: Multi-Theme-System (siehe design-system Notiz).
 * Core liefert EIN Default-Theme — dieses Layer ergänzt umschaltbare
 * Themes als statische CSS-Dateien (public/themes/*) mit Cookie-
 * Persistenz. Keine eigenen Tables, keine Runtime-CSS-Generierung.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  // Schriftpaare: build-prozessiert (nicht public/), damit @nuxt/fonts die
  // Familien erkennt und self-hostet; absoluter Pfad wie im Core-Layer
  // (relative css-Pfade lösen Apps sonst relativ zu sich selbst auf)
  css: [join(currentDir, './app/assets/css/fonts.css')],
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
