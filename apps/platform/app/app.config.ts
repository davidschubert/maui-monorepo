export default defineAppConfig({
  pukalani: {
    brand: { name: 'Pukalani' },
    // Demo-Community „Morgenlicht" (Tagesliste 2026-07-26): der Banner macht
    // auf diesen Hosts sichtbar, dass Inhalte Beispiel-Material sind; der CTA
    // führt in den Self-Service-Trichter.
    demo: {
      hosts: ['demo.pukalani.app'],
      ctaUrl: 'https://start.pukalani.app',
    },
    // Chrome-Registry (S9): der Operator-Changelog (admin-Layer schaltet
    // WhatsNew-Button + Footer-Link per Default an) ist KEIN Tenant-Inhalt —
    // auf Kunden-Hosts bleiben beide aus (Map-Override, `false` = ab).
    chrome: {
      utilities: {
        whatsNew: false,
      },
      changelogLink: false,
    },
    // Footer-Fallback (Davids Entscheidung 5, 2026-07-27): Kunden pflegen
    // Impressum/Datenschutz als CMS-Seiten (Legal-Slugs → Footer); solange
    // ein Tenant (z. B. die Demo Morgenlicht) keine hat, verlinkt der Footer
    // das Betreiber-Impressum auf pukalani.app (externer Link).
    legalLinks: [
      { to: 'https://pukalani.app/imprint', labelKey: 'legal.imprint' },
    ],
    // KI-Assist (Moderation) ist als Gate AN — wirksam wird es erst, wenn
    // NUXT_AI_KEY auf dem Server liegt (isAiAvailable prüft beides). Demo-
    // Entscheidung „alle Produkte an" (David, 2026-07-26).
    ai: { enabled: true },
    // Strukturierte 5xx-Logs + Client-Error-Inbox — auf der Multi-Tenant-App
    // ohnehin überfällig (der platform-.env-Ausfall wäre damit im Log
    // sofort benannt gewesen statt nur als generischer 500 sichtbar).
    observability: { enabled: true },
    comments: {
      // Moderations-Demo: ab 3 offenen Meldungen verschwindet ein Kommentar
      // automatisch aus der öffentlichen Ansicht (zweiphasiges Hide).
      autoHideReports: 3,
    },
    // Mehr-Host-Betrieb: canonical/hreflang/og:url müssen den Host tragen, der
    // den Request bekommen hat. Diese App bedient JEDEN Mandanten-Host plus die
    // Kontroll-Hosts — mit der einen Env-Basis (NUXT_PUBLIC_I18N_BASE_URL)
    // zeigten sie überall auf platform.pukalani.app (Audit-Befund B1).
    // Bildmarke je Community (K2): jeder Mandanten-Host bekommt ein eigenes
    // Favicon (Kreis in seiner Theme-Farbe + Initial) aus /favicon.svg statt
    // des Nitro-Platzhalters, dazu theme-color in derselben Farbe.
    // Vorschaubild je Community (B2, Davids Entscheidung 2026-07-29): geteilte
    // Links kamen ohne Bild an. /og/<key>.png erzeugt es aus Theme-Farbe +
    // Community-Name — kein Handgriff für den Kunden, ab dem ersten Tag da.
    seo: { originFromRequest: true, tenantFavicon: true, tenantOgImage: true },
    // DIE Multi-Tenant-App (Horizont 3): das Tenant-Gate ist hier AN — die
    // Middleware 00.tenant.ts (core) löst jeden Request-Host über den in
    // server/plugins/tenant-resolver.ts registrierten Resolver auf.
    // Unbekannte Hosts bekommen 404; Pool-Hosts arbeiten zeilen-gescoped
    // (scopeQuery/scopeRow, z. B. comments-011).
    tenancy: {
      enabled: true,
      // Der Kundenbereich (Self-Service-Onboarding, SAAS-ROADMAP #1) läuft auf
      // DEMSELBEN Deployment, ist aber kein Mandant. Alle drei Namen sind in
      // RESERVED_SUBDOMAINS gesperrt, können also niemals Tenant-Hosts werden;
      // die Wildcard-DNS `*.pukalani.app` zeigt schon hierher — es braucht
      // also keine neue ploi-Site. Lokal per
      // NUXT_PUBLIC_TENANCY_CONTROL_HOSTS=app.localhost überschreiben.
      //
      // Umbenennung 2026-07-25 (Davids Entscheidung): `my` ist der Kundenbereich
      // (trägt Anmeldung UND späteren Kontobereich — Abo, Rechnungen, Team),
      // `start` ist der Kurz-Link in den Wizard (Visitenkarte, Bio).
      // Der Altname `app` ist am 2026-07-27 ENTFERNT (Davids Entscheidung):
      // er war nie beworben, hatte nie einen eigenen DNS-Eintrag (lief über
      // die Wildcard) und stand nur noch hier. Er antwortet jetzt 404 wie
      // jeder unbekannte Host. `app` bleibt in RESERVED_SUBDOMAINS gesperrt —
      // ein Selbstbedienungs-Kunde darf den Namen NIE bekommen (Phishing).
      controlHosts: ['my.pukalani.app', 'start.pukalani.app'],
      // H3-4.3 Quota (Blueprint S4): Pool-Kunden erschöpfen den geteilten
      // Server nicht. PRO PLAN gestaffelt (David-Freigabe 2026-07-23) — der
      // Tenant trägt seinen Plan (tenants.plan, control-013, Default free).
      // Silo-Tenants: kein Limit (eigenes Projekt). perDay = rollierende 24 h.
      // Plan-Rename 2026-07-26 (Davids Pricing: Basic/Personal/Pro) —
      // Zahlen unverändert, nur die Keys sind umgezogen.
      quota: {
        enabled: true,
        plans: {
          basic: { comments: { perDay: 200, total: 5_000 } },
          personal: { comments: { perDay: 1000, total: 50_000 } },
          pro: { comments: { perDay: 5000, total: 250_000 } },
        },
      },
      // Produkt-Zugriff pro Plan (P4, Davids Zuordnung 2026-07-26): Produkt-
      // Key → Mindest-Plan. Nicht gelistete Produkte (comments, pages,
      // themes-Katalog, Moderation) sind Basic = frei. KI zählt als Pro-
      // Produkt (kostet uns pro Aufruf); Events/Courses folgen bei GA.
      products: {
        posts: 'personal',
        ai: 'pro',
        events: 'pro',
        courses: 'pro',
      },
    },
  },
  ui: {},
})
