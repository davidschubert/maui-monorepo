/**
 * Feature Layer: Async Course Builder / LMS v1 (Phase 24). Markdown-Lektionen
 * + optionale externe Video-URL (KEIN Video-Hosting), Enrollment + Fortschritt.
 * A14-Knackpunkt: courses importiert NICHTS aus billing — der Access-Guard
 * für 'paid'-Kurse wird von der APP registriert (registerCourseAccessGuard,
 * Muster registerUserDataContributor); ohne Guard fail-closed 403.
 * Lektions-Diskussion = comments-Layer via #comments-Slot (App-Komposition).
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
