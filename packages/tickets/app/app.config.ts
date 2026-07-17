/**
 * tickets meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged) — das Layout rendert sie
 * capability-gefiltert (Layer-Grenze A14).
 */
export default defineAppConfig({
  maui: {
    admin: {
      modules: [
        {
          id: 'tickets',
          featureKey: 'tickets',
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
