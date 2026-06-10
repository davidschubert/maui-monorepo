import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))

/**
 * Feature Layer: Reddit-artiges Kommentarsystem (eigenes Datenmodell —
 * Regel 3: eigene Tables, deshalb niemals Core). Extended den Core NICHT
 * selbst — die App komponiert beide: extends: [comments, core].
 * Spec: reddit-comment-system-setup (targetId/targetType-Architektur).
 */
export default defineNuxtConfig({
  // Layer-stores werden nicht auto-gescannt (Stolperfalle)
  imports: {
    dirs: [join(currentDir, './app/stores')],
  },

  // Eigene Layer-Strings — mergen mit Core- und App-Locales (gleiche codes)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
