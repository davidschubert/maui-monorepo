/**
 * feedback meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — das Admin-Layout rendert sie
 * capability-gefiltert (Layer-Grenze A14).
 */
export default defineAppConfig({
  pukalani: {
    // Chrome-Registry (S9): der schwebende Feedback-Button (fixed unten
    // links) — Zone 'overlay', gehört semantisch nicht in die Header-Nav.
    chrome: {
      utilities: {
        feedback: { component: 'FeedbackButton', order: 10, zone: 'overlay' },
      },
    },
    admin: {
      modules: [
        {
          // E9 'operator': `feedback.manage` trägt keine Community-Rolle (N1) —
          // die Rückmeldungen laufen beim BETREIBER auf, nicht beim Kunden.
          id: 'feedback',
          scope: 'operator',
          productKey: 'feedback',
          labelKey: 'admin.nav.feedback',
          icon: 'i-ph-megaphone-simple',
          to: '/dashboard/feedback',
          requiredCapability: 'feedback.manage',
          group: 'management',
          order: 1,
        },
      ],
    },
    feedback: {
      /** POST-Endpoint „Feedback → Ticket" — die APP setzt ihn, wenn sie
       *  feedback mit einem Board-Layer verdrahtet (A14-Vertrag, Body:
       *  { feedbackId }). Leer = kein Übernehmen-Button. */
      ticketEndpoint: '',
    },
  },
})
