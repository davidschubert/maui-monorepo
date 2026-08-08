/**
 * Produkt Layer: PRIVATE NACHRICHTEN (Konzept docs/plans/
 * PRIVATE-NACHRICHTEN-KONZEPT.md, Stufe 1 — gebaut 2026-08-05).
 *
 * Ein 1:1-Nachrichtenweg zwischen zwei Mitgliedern DERSELBEN Community.
 * Eigenes Datenmodell (conversations, messages, message_blocks,
 * message_settings — Regel 3: eigene Tables, niemals Core). Extended den Core
 * NICHT selbst.
 *
 * ── DER SCHUTZ IST TEIL DES PRODUKTS, NICHT SEIN NACHTRAG ─────────────────
 * Davids Rahmensetzung wörtlich: „ein Nachrichtenweg ohne Meldeweg und Sperre
 * ist ein Missbrauchskanal, den man hinterher nicht mehr zumacht." Deshalb
 * liegen Melden, Blockieren, das TL1-Gate, die drei Rate-Budgets und der
 * Owner-Schalter in DERSELBEN Stufe wie der Kanal — nichts davon ist ein
 * „später".
 *
 * ── WAS DIESER LAYER NICHT KENNT ──────────────────────────────────────────
 * Er kennt keinen anderen Produkt-Layer (A14). Die Vertrauensstufe kommt über
 * den Core-Vertrag `resolveTrustLevel` (den posts besetzt), der Melde-Weg über
 * die moderation-Registry, die Benachrichtigung über `notify()`. Die
 * Komposition „Nachricht schreiben am Autorennamen" gehört nach A14 in
 * `blueprint`; hier liegt nur der wiederverwendbare Knopf.
 */
export default defineNuxtConfig({
  /**
   * ALT-PFAD (F51, 2026-08-07): der Owner-Schalter ist von der Konto-Hülle in
   * den Community-Hub gezogen. Beide Locales, weil eine routeRule nur Pfade
   * sieht (`prefix_except_default`).
   */
  routeRules: {
    '/dashboard/settings/messages': { redirect: { to: '/dashboard/community/messages', statusCode: 301 } },
    '/de/dashboard/settings/messages': { redirect: { to: '/de/dashboard/community/messages', statusCode: 301 } },
  },

  // Eigene Layer-Strings — mergen mit Core- und App-Locales (gleiche codes)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
