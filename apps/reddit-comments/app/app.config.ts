export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core).
  // OAuth-Provider/AGB bleiben aus, bis Console-Config bzw. AGB-Seite existiert:
  // maui: { auth: { providers: ['github'], termsUrl: '/agb' } }
  maui: {
    ai: {
      // Core-KI (aiComplete): Moderations-Assist in der Queue; Key server-only
      // via NUXT_AI_KEY. Die Ticket-Triage läuft weiter über maui.tickets.ai.
      enabled: true,
    },
    auth: {
      // Passwortloser Code-Login (Phase 19) — Email-OTP ist instanzseitig aktiv
      otp: true,
    },
    observability: {
      // Strukturierte 5xx-Server-Logs + Client-Error-Inbox (Core-Default: aus)
      enabled: true,
      clientErrors: true,
    },
    feedback: {
      // Feedback → Ticket (P2): die App verdrahtet feedback mit dem
      // tickets-Board über diese Route (A14) — Ticket landet in der
      // ersten Board-Liste, Feedback wird als erledigt markiert
      ticketEndpoint: '/api/app/feedback-ticket',
    },
    tickets: {
      // KI-Triage (P3) via OpenRouter — Key: NUXT_TICKETS_AI_KEY in .env
      // (server-only). Model/baseUrl-Defaults kommen aus dem Layer.
      ai: { enabled: true },
    },
    // Stripe-Billing (Phase 23) — TEST-Mode; Products/Prices legt David im
    // Dashboard an (lookup_keys wie hier deklariert). Feature-Strings sind
    // App-Konvention (courses konsumiert 'paidCourses' über den Access-Guard).
    billing: {
      enabled: true,
      currency: 'eur',
      trialDays: 0,
      plans: [
        {
          id: 'free',
          labelKey: 'billing.plans.free',
          features: [],
          // highlights = reine Anzeige (billing.features.*); features bleiben Entitlements
          highlights: ['freeCommunity', 'freeVotes', 'freeEvents', 'freeCourses', 'freeFeed', 'freeThemes', 'freePrivacy'],
          lookupKeys: null,
        },
        {
          id: 'pro',
          labelKey: 'billing.plans.pro',
          features: ['paidCourses'],
          highlights: ['proEverything', 'paidCourses', 'proNewCourses', 'proSupport', 'proEarlyAccess', 'proSupportsProject'],
          highlight: true,
          lookupKeys: { monthly: 'maui_pro_monthly', yearly: 'maui_pro_yearly' },
        },
      ],
      // „Alle Funktionen im Vergleich" — Anzeige-Kopie (i18n-Keys billing.compare.*);
      // Werte: true = Haken, false = nicht enthalten, String = i18n-Key (Text-Zustand)
      compare: {
        sections: [
          {
            labelKey: 'billing.compare.community.title',
            rows: [
              { labelKey: 'billing.compare.community.posts', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.community.polls', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.community.questions', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.community.comments', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.community.votes', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.community.mentions', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.community.markdown', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.community.realtime', plans: { free: true, pro: true } },
            ],
          },
          {
            labelKey: 'billing.compare.events.title',
            rows: [
              { labelKey: 'billing.compare.events.discover', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.events.rsvp', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.events.personal', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.events.calendar', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.events.ics', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.events.reminders', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.events.live', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.events.replays', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.events.tickets', plans: { free: 'billing.compare.payPerEvent', pro: 'billing.compare.payPerEvent' } },
            ],
          },
          {
            labelKey: 'billing.compare.courses.title',
            rows: [
              { labelKey: 'billing.compare.courses.free', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.courses.members', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.courses.pro', plans: { free: false, pro: true } },
              { labelKey: 'billing.compare.courses.progress', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.courses.discussion', plans: { free: true, pro: true } },
            ],
          },
          {
            labelKey: 'billing.compare.personalization.title',
            rows: [
              { labelKey: 'billing.compare.personalization.themes', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.personalization.darkmode', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.personalization.language', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.personalization.livetheme', plans: { free: true, pro: true } },
            ],
          },
          {
            labelKey: 'billing.compare.activity.title',
            rows: [
              { labelKey: 'billing.compare.activity.feed', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.activity.notifications', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.activity.replies', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.activity.whatsnew', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.activity.presence', plans: { free: true, pro: true } },
            ],
          },
          {
            labelKey: 'billing.compare.account.title',
            rows: [
              { labelKey: 'billing.compare.account.profile', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.account.otp', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.account.sessions', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.account.export', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.account.deletion', plans: { free: true, pro: true } },
            ],
          },
          {
            labelKey: 'billing.compare.platform.title',
            rows: [
              { labelKey: 'billing.compare.platform.moderation', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.platform.dashboard', plans: { free: 'billing.compare.roleBased', pro: 'billing.compare.roleBased' } },
              { labelKey: 'billing.compare.platform.branding', plans: { free: 'billing.compare.roleBased', pro: 'billing.compare.roleBased' } },
              { labelKey: 'billing.compare.platform.gdpr', plans: { free: true, pro: true } },
            ],
          },
          {
            labelKey: 'billing.compare.support.title',
            rows: [
              { labelKey: 'billing.compare.support.communitySupport', plans: { free: true, pro: true } },
              { labelKey: 'billing.compare.support.priority', plans: { free: false, pro: true } },
              { labelKey: 'billing.compare.support.early', plans: { free: false, pro: true } },
            ],
          },
        ],
      },
    },
    // Die frühere maui.roadmap (Anzeige-Kopie) ist durch das Ticket-Board
    // ersetzt (tickets-Layer, /dashboard/tickets) — Planungs-Wahrheit bleibt
    // docs/GOALS.md + docs/plans/*.
  },
  ui: {},
})
