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
    // Interne Produkt-Roadmap (dashboard/admin/roadmap) — Anzeige-Kopie;
    // die Planungs-Wahrheit bleibt docs/GOALS.md + docs/plans/*.
    roadmap: {
      updatedAt: '2026-07-08',
      now: [
        { title: 'Billing (Stripe)', description: 'Abos mit Checkout, Kundenportal, Webhooks, Entitlements — alle Entscheidungen fixiert, Plan liegt bereit.', icon: 'i-ph-credit-card', ref: 'Phase 23' },
        { title: 'Paid-Event-Tickets verbinden', description: 'Checkout (mode payment) + Webhook → grantEventTicket(). Events-Seite ist fertig vorbereitet, fail-closed.', icon: 'i-ph-ticket', ref: 'mit Phase 23' },
      ],
      next: [
        { title: 'Kurse (LMS v1)', description: 'Markdown-Lektionen, Fortschritt, Abschluss — Zugang über Abo-Entitlements; Lektions-Diskussion über Kommentare.', icon: 'i-ph-graduation-cap', ref: 'Phase 24' },
        { title: 'Production-Deployment', description: 'Hetzner + ploi.io, Custom Domain, Deploy-Workflow — wartet auf Server & Domain.', icon: 'i-ph-rocket-launch', ref: 'Phase 17' },
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
        { title: 'Events komplett: Kalender, Live, Replays, Reminder, Votes, Suche, Paid-Vorbereitung', ref: 'Phasen 22/26/27' },
        { title: 'Community-Posts (Beiträge, Umfragen, Fragen)', ref: 'Phase 25' },
        { title: 'Activity-Feed mit Realtime', ref: 'Phase 21' },
        { title: 'Theme-Studio v2 (eigene Themes, Schriften, Live-Propagation)', ref: 'Phasen 37–45' },
      ],
    },
  },
  ui: {},
})
