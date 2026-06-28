/**
 * Feature Layer: Moderation („etwas melden") — domänen-agnostisch.
 * Kennt nur targetType/targetId, besitzt die `reports`-Table + Melde-Queue,
 * NICHT die Konsequenz (Hide/Block bleibt in comments/admin). Siehe
 * docs/MODERATION-AND-LAYER-BOUNDARIES.md + CONCEPT.md A14.
 *
 * Fundament-Layer: hängt nur von core ab, von keinem Feature. Extended den
 * Core NICHT selbst — die App komponiert: extends: [..., moderation, core].
 */
export default defineNuxtConfig({
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
