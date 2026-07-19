/**
 * Feature Layer: Community-Feed (Posts, Polls, Questions) — Member-Content,
 * Plan: docs/plans/COMMUNITY-POSTS.md. Eigenes Datenmodell (community_posts,
 * poll_votes — Regel 3: eigene Tables, niemals Core). Antworten liefert der
 * comments-Layer via targetType 'post' — komponiert in der APP (A14), hier
 * KEIN comments-Import. Extended den Core NICHT selbst.
 */
export default defineNuxtConfig({
  // Alt-URL /community → /feed (Rename 2026-07-19): 301 für Bookmarks und
  // Alt-Links in Bestandsdaten (Notification-/Activity-Rows, targetUrl)
  routeRules: {
    '/community': { redirect: { to: '/feed', statusCode: 301 } },
    '/de/community': { redirect: { to: '/de/feed', statusCode: 301 } },
  },
  // Eigene Layer-Strings — mergen mit Core- und App-Locales (gleiche codes)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
