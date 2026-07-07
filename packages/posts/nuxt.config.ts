/**
 * Feature Layer: Community-Feed (Posts, Polls, Questions) — Member-Content,
 * Plan: docs/plans/COMMUNITY-POSTS.md. Eigenes Datenmodell (community_posts,
 * poll_votes — Regel 3: eigene Tables, niemals Core). Antworten liefert der
 * comments-Layer via targetType 'post' — komponiert in der APP (A14), hier
 * KEIN comments-Import. Extended den Core NICHT selbst.
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
