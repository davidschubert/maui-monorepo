/**
 * Feature Layer: Ticket-Board (Trello-artiges Kanban für Betreiber) —
 * Plan: docs/plans/TICKETS-BOARD.md. Eigenes Datenmodell (ticket_lists,
 * tickets — Regel 3: eigene Tables, niemals Core). Operator-only
 * (Capability tickets.manage, Admins + Mods). Extended den Core NICHT
 * selbst — die App komponiert.
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
