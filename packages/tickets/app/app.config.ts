/**
 * tickets meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — das Layout rendert sie
 * capability-gefiltert (Layer-Grenze A14).
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      modules: [
        {
          // E9 'operator': das Board ist das interne Werkzeug des Betreibers
          // (`tickets.manage` trägt keine Community-Rolle, N1).
          id: 'tickets',
          scope: 'operator',
          productKey: 'tickets',
          labelKey: 'admin.nav.tickets',
          icon: 'i-ph-kanban',
          to: '/dashboard/tickets',
          requiredCapability: 'tickets.manage',
          group: 'management',
          order: 2,
        },
      ],
    },
    comments: {
      // Board-Diskussionen sind intern: comments-Layer behandelt targetType
      // 'ticket' als Operator-Target (nur admin/moderator lesen + schreiben)
      operatorTargets: ['ticket'],
    },
    tickets: {
      /** KI-Triage (P3): bewertet Tickets via OpenAI-kompatibler API
       *  (Default OpenRouter). Key server-only: NUXT_TICKETS_AI_KEY.
       *  Layer-Default AUS — die App aktiviert explizit. */
      ai: {
        enabled: false,
        model: 'anthropic/claude-haiku-4.5',
        baseUrl: 'https://openrouter.ai/api/v1',
      },
    },
  },
})
