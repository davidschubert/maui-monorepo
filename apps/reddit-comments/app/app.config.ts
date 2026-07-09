export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core).
  // OAuth-Provider/AGB bleiben aus, bis Console-Config bzw. AGB-Seite existiert:
  // maui: { auth: { providers: ['github'], termsUrl: '/agb' } }
  maui: {
    auth: {
      // Passwortloser Code-Login (Phase 19) — Email-OTP ist instanzseitig aktiv
      otp: true,
    },
    observability: {
      // Strukturierte 5xx-Server-Logs + Client-Error-Inbox (Core-Default: aus)
      enabled: true,
      clientErrors: true,
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
    // Interne Produkt-Roadmap (dashboard/admin/roadmap) — Anzeige-Kopie;
    // die Planungs-Wahrheit bleibt docs/GOALS.md + docs/plans/*.
    roadmap: {
      updatedAt: '2026-07-08',
      now: [
        { title: 'Production-Deployment vorbereiten', description: 'Hetzner + ploi.io, Custom Domain — der letzte offene Roadmap-Block.', icon: 'i-ph-rocket-launch', ref: 'Phase 17' },
      ],
      next: [
        { title: 'Subscription-/Plan-Filter in der Benutzerverwaltung', description: 'People-Liste um Abo-Status und Plan filterbar machen (Spalten + Nav-Zähler) — braucht die Billing-Daten.', icon: 'i-ph-funnel', ref: 'nach Phase 23' },
      ],
      later: [
        { title: 'E-Mail-/Push-Benachrichtigungen', description: 'Appwrite Messaging andocken (z. B. Event-Reminder als E-Mail) — bisher bewusst nur In-App.', icon: 'i-ph-envelope' },
        { title: 'Scheduled Function für Event-Reminder', description: 'Der key-geschützte Sweep-Endpoint existiert; eine geplante Function schließt die Lücke ohne Seitenbesuche.', icon: 'i-ph-clock-clockwise' },
        { title: 'Embed-Widget', description: 'Kommentare als einbettbares Widget für externe Seiten.', icon: 'i-ph-code', ref: 'Plan vorhanden' },
        { title: 'Changelog-Entwurf per Function (Track 2B)', description: 'Automatische Changelog-Drafts aus Commits — Scaffold existiert, Aktivierung offen.', icon: 'i-ph-megaphone', ref: 'Plan vorhanden' },
        { title: 'Themes-Vollausbau', description: '26 Themes × Farbvariationen auf der bestehenden Studio-Infrastruktur.', icon: 'i-ph-palette', ref: 'Plan vorhanden' },
        { title: 'Event-Serien (Recurrence)', description: 'Wiederkehrende Events — bewusst vertagt, v1 sind Einzeltermine.', icon: 'i-ph-repeat' },
        { title: 'Kurs-Einzelkauf', description: 'One-time-Checkout je Kurs — bewusst vertagt, v1 ist Abo-Zugang.', icon: 'i-ph-shopping-cart' },
        { title: 'Spaces/Rooms', description: 'Community-Untergliederung in Bereiche (comments ist mit targetType space/note vorbereitet).', icon: 'i-ph-squares-four' },
        { title: 'Core-Versionierung', description: 'CHANGELOG.md + Git-Tags für den Core-Layer.', icon: 'i-ph-tag' },
        { title: 'E2E-Ausbau', description: 'Playwright-Suiten für eingeloggte Flows (Events, Posts, Dashboard).', icon: 'i-ph-test-tube' },
      ],
      shipped: [
        { title: 'Stripe-Billing live verifiziert (Checkout, Webhook, Realtime, Kuendigung) + Kurse (LMS v1) + Feedback-Widget', ref: 'Phasen 23/24 ✅' },
        { title: 'Events komplett: Kalender, Live, Replays, Reminder, Votes, Suche, Paid-Vorbereitung', ref: 'Phasen 22/26/27' },
        { title: 'Community-Posts (Beiträge, Umfragen, Fragen)', ref: 'Phase 25' },
        { title: 'Activity-Feed mit Realtime', ref: 'Phase 21' },
        { title: 'Theme-Studio v2 (eigene Themes, Schriften, Live-Propagation)', ref: 'Phasen 37–45' },
      ],
    },
  },
  ui: {},
})
