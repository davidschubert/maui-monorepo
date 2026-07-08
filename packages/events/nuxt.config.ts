/**
 * Feature Layer: Event Calendar (Phase 22) — Liste + Detailseite, RSVP mit
 * server-autoritativem Teilnehmerzähler, ICS-Export. Eigenes Datenmodell
 * (events, event_rsvps — Regel 3: eigene Tables, niemals Core). Bewusst
 * schlicht: keine Recurring Events, keine Reminder-Mails, kein Monats-Grid.
 * Kommentare liefert der comments-Layer via targetType 'event' — komponiert
 * in der APP (A14), hier KEIN comments-Import. Extended den Core NICHT selbst.
 */
export default defineNuxtConfig({
  runtimeConfig: {
    // server-only: schaltet POST /api/events/reminder-sweep frei
    // (scheduled-Function-Andockpunkt) — leer = Endpoint deaktiviert.
    // Env: NUXT_EVENTS_SWEEP_KEY
    eventsSweepKey: '',
  },

  // Eigene Layer-Strings — mergen mit Core- und App-Locales (gleiche codes)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
