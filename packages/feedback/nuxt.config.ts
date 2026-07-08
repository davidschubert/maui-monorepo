/**
 * Feature Layer: Feedback-Widget — schwebender Button (die APP platziert
 * <FeedbackButton /> in ihrem Layout, A14-Komposition), kleines Popup,
 * eigenes Datenmodell (Table feedback) + Admin-Sichtung. Auch Gäste dürfen
 * senden (Rate-Limit-Bucket feedback:create im Core). Extended den Core
 * NICHT selbst.
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
