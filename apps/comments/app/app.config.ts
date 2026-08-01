export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core).
  // OAuth-Provider/AGB bleiben aus, bis Console-Config bzw. AGB-Seite existiert:
  // pukalani: { auth: { providers: ['github'], termsUrl: '/agb' } }
  pukalani: {
    brand: { name: 'Hawaii Studio' },
    // Chrome-Registry: die Nav-Einträge für events/courses sind mit C4
    // (2026-07-31) in ihre LAYER gezogen (packages/{events,courses}/app/
    // app.config.ts) — jede App, die den Layer zieht, bekommt sie jetzt
    // automatisch, und der Pool ist nicht mehr die Ausnahme. Ein App-Override
    // bleibt möglich (Objekt-Map, gleicher Key gewinnt), wird hier aber nicht
    // gebraucht.
    events: {
      // A14-Komposition events + billing: DIESE App bringt die Checkout-Route
      // mit (server/api/events/[id]/checkout.post.ts) und sagt der
      // Bauplan-Seite über die Config, wo sie liegt. Ohne Eintrag bleibt der
      // Kauf-CTA fail-closed („Bald verfügbar") — so im Pool, wo bezahlte
      // Events gesperrt sind (D1).
      ticketCheckoutPath: '/api/events/{id}/checkout',
    },
    ai: {
      // Core-KI (aiComplete): Moderations-Assist in der Queue; Key server-only
      // via NUXT_AI_KEY. Die Ticket-Triage läuft weiter über pukalani.tickets.ai.
      enabled: true,
    },
    auth: {
      // Passwortloser Code-Login (Phase 19) — Email-OTP ist instanzseitig aktiv
      otp: true,
      // E2 Embed-Login: Popup-Handoff → CHIPS-partitioniertes Session-Cookie
      // (/api/auth/embed-handoff + /api/auth/embed-session). Nur zusammen mit
      // csrfOriginCheck aktivieren — SameSite=None reißt sonst den CSRF-Schutz.
      embedSession: true,
    },
    security: {
      // PFLICHT seit embedSession (Embed-Plan § 3b): partitionierte Cookies
      // schützen nicht mehr per sameSite — unsichere Methoden prüfen Origin.
      csrfOriginCheck: true,
    },
    observability: {
      // Strukturierte 5xx-Server-Logs + Client-Error-Inbox (Core-Default: aus)
      enabled: true,
      clientErrors: true,
    },
    comments: {
      // Auto-Hide: ab 3 offenen Meldungen verschwindet ein Kommentar aus der
      // Öffentlichkeit, bis die Moderation entscheidet (Meldungen bleiben offen)
      autoHideReports: 3,
      // iframe-Embed: seit E3 speist die SITE-REGISTRY (embed_sites,
      // /dashboard/embed) die frame-ancestors-CSP — hier stehen nur noch
      // statische Zusatz-Origins: localhost:* fürs Dev-/E2E-Umfeld
      // (Port-Wildcard ist gültige CSP-host-source; in Prod praktisch
      // wirkungslos, ein „Angreifer" bräuchte die Maschine des Users).
      // '*' bliebe die bewusste „offen wie Disqus"-Option (Plan § 6.7).
      embed: {
        enabled: true,
        allowedOrigins: ['http://localhost:*', 'http://127.0.0.1:*'],
        // Gast-Kommentare im Widget (Embed E4): Kommentieren ohne Account
        // (Name+E-Mail, keine Verifikation). E-Mail landet nur in guest_authors.
        guests: true,
      },
    },
    // feedback + tickets sind mit E10 nach apps/control gezogen (Davids
    // Entscheidung 7) — mit ihnen fiel die App-Verdrahtung „Feedback → Ticket"
    // (pukalani.feedback.ticketEndpoint) und die Ticket-KI-Triage
    // (pukalani.tickets.ai) weg. Beides steht jetzt in apps/control.
    // Stripe-Billing (Phase 23) — TEST-Mode; Products/Prices legt David im
    // Dashboard an (lookup_keys wie hier deklariert). Produkt-Strings sind
    // App-Konvention (courses konsumiert 'paidCourses' über den Access-Guard).
    billing: {
      enabled: true,
      currency: 'eur',
      trialDays: 0,
      plans: [
        {
          // Plan-ID + labelKey bleiben BEWUSST 'free' (Bestandsdaten,
          // checkout-Schema, Webhook-Mapping) — das ANZEIGE-Label hinter
          // billing.plans.free heißt seit dem P4-Rename „Basic" (Audit S10).
          id: 'free',
          labelKey: 'billing.plans.free',
          products: [],
          // highlights = reine Anzeige (billing.products.*); products bleiben Entitlements
          highlights: ['freeCommunity', 'freeVotes', 'freeEvents', 'freeCourses', 'freeFeed', 'freeThemes', 'freePrivacy'],
          lookupKeys: null,
        },
        {
          id: 'pro',
          labelKey: 'billing.plans.pro',
          products: ['paidCourses'],
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
    // Die frühere pukalani.roadmap (Anzeige-Kopie) ist durch das Ticket-Board
    // ersetzt (tickets-Layer, /dashboard/tickets) — Planungs-Wahrheit bleibt
    // docs/GOALS.md + docs/plans/*.
  },
  ui: {},
})
