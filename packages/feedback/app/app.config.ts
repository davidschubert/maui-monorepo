/**
 * feedback meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged) — das Admin-Layout rendert sie
 * capability-gefiltert (Layer-Grenze A14).
 */
export default defineAppConfig({
  maui: {
    admin: {
      modules: [
        {
          id: 'feedback',
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
