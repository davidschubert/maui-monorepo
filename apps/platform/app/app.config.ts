export default defineAppConfig({
  pukalani: {
    // homeUrl: der Ausweg von einem unbekannten Wildcard-Host (C12b) — diese
    // App bedient `*.pukalani.app`, also landen hier alle Vertipper.
    brand: { name: 'Pukalani', homeUrl: 'https://pukalani.app' },
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
    /**
     * ANMELDUNG (F37, 2026-08-02) — beides war im Silo an und im Pool aus.
     *
     * `otp`: der passwortlose Code-Login. Reiner Anzeige-/Routen-Schalter der
     * App; die Voraussetzung liegt im Appwrite-Projekt `pool` („Auth →
     * Settings → Email OTP") und beim SMTP der Instanz. Fehlt eines davon,
     * endet der Weg NICHT mehr in einem generischen Fehler: die Route
     * antwortet 503 `otp_unavailable` und die Anmeldeseite sagt „hier gerade
     * nicht verfügbar, nimm dein Passwort" (core/shared/authMethodAvailability.ts).
     *
     * `embedSession`: der Popup-Handoff, mit dem ein Angemeldeter IM iframe
     * kommentieren kann (CHIPS-partitioniertes Cookie). Gehört zwingend zum
     * Embed-Produkt unten — und zwingend zu `security.csrfOriginCheck`.
     */
    auth: { otp: true, embedSession: true },
    /**
     * PFLICHT, sobald `auth.embedSession` an ist: das partitionierte Cookie
     * ist `SameSite=None`, sameSite schützt also nicht mehr vor fremden
     * Formular-POSTs.
     *
     * NEU GEPRÜFT FÜR DEN POOL (nicht aus dem Silo übernommen): die Härtung
     * F32 behandelt `Sec-Fetch-Site: same-site` seit heute streng, und unter
     * der Wildcard `*.pukalani.app` ist JEDER Mandanten-Host same-site zu jedem
     * anderen — genau deshalb wurde sie verschärft. Was hier durch muss, geht
     * trotzdem durch:
     *  - Browser-Requests dieser App sind ausnahmslos RELATIV (kein einziger
     *    absoluter $fetch im App-Code) → `same-origin`.
     *  - Der Embed-Fluss läuft same-origin: das iframe zeigt auf
     *    `<community-host>/embed` und ruft `<community-host>/api/*`; das
     *    Login-Popup ist unsere eigene Seite auf demselben Host. `embed.js` auf
     *    der GASTGEBER-Seite macht nur GET (Zähler) — unsichere Methoden fasst
     *    die Regel nicht an.
     *  - Server-zu-Server (Naht zum Control Plane, Beweis-Skripte) trägt weder
     *    Origin noch Sec-Fetch-Site → erlaubt, und ohne Browser-Cookie.
     * Was NICHT mehr durchgeht, ist genau der Fall, für den die Härtung da ist:
     * ein Formular auf `boese.pukalani.app` gegen `kunde.pukalani.app/api/*`.
     */
    security: { csrfOriginCheck: true },
    comments: {
      // Moderations-Demo: ab 3 offenen Meldungen verschwindet ein Kommentar
      // automatisch aus der öffentlichen Ansicht (zweiphasiges Hide).
      autoHideReports: 3,
      /**
       * DAS WIDGET IM POOL (F37, Davids Entscheidung 2026-08-02).
       *
       * Die Technik war längst mandantenfähig (`embed_sites` trägt communityId,
       * comments-015/016; die Datentür scopet Liste, Anlage und Löschung), und
       * die Landing verkauft das Einbetten als Teil von „Diskussionen" — nur
       * der Schalter fehlte. Jetzt kann jede Community ihr Widget auf ihrer
       * eigenen Website einbinden.
       *
       * Wer die Einbetter registriert: der OWNER, über `community.embed`
       * (/dashboard/embed). Bis heute verlangte diese Seite `system.manage` —
       * ein Instanz-Label, das kein Kunde je trägt.
       *
       * `allowedOrigins` sind ZUSÄTZLICHE, statische Origins zur Registry:
       * localhost fürs Entwickeln und für die Beweis-Skripte. In Produktion
       * praktisch wirkungslos (ein „Angreifer" bräuchte die Maschine des
       * Nutzers); die echten Einbetter jeder Community kommen aus `embed_sites`
       * und gelten nur für sie.
       *
       * `guests` bleibt BEWUSST AUS (anders als im Silo): Gast-Kommentare legen
       * Name+E-Mail eines Unbekannten in `guest_authors` — das ist eine
       * Entscheidung, die jede Community für sich treffen muss, und dafür gibt
       * es noch keinen Schalter im Kunden-Dashboard. Im Widget kommentiert also
       * vorerst, wer sich anmeldet (Popup-Handoff, s. auth.embedSession oben).
       */
      embed: {
        enabled: true,
        allowedOrigins: ['http://localhost:*', 'http://127.0.0.1:*'],
      },
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
    // App-Icon je Community (C7): wer eine Community täglich benutzt, legt sie
    // auf den Home-Bildschirm — ohne /icon/<key>.png landet dort ein
    // Screenshot der Seite statt der Bildmarke.
    seo: { originFromRequest: true, tenantFavicon: true, tenantOgImage: true, tenantAppIcon: true },
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
      // F12: `start.*` ist der Kurz-Link in den Wizard — dort bleibt `/` der
      // Trichter. `my.*` ist der KUNDENBEREICH und zeigt seit F12 die
      // Übersicht „Deine Communities"; wer dort keine hat, wird von der
      // Übersicht selbst in den Wizard weitergeschickt. Lokal per
      // NUXT_PUBLIC_TENANCY_WIZARD_HOSTS überschreiben.
      wizardHosts: ['start.pukalani.app'],
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
        // ⚠️ VORSCHLAG (2026-08-02) — BRAUCHT NOCH DAVIDS BESTÄTIGUNG.
        // Begründung: die Mediathek legt BINÄRDATEN auf die geteilte Platte
        // (als einziger Layer) und kostet damit laufend Speicher — deshalb
        // nicht in Basic. Der Activity-Feed ist Grundfunktion: er zeigt nur,
        // was ohnehin passiert ist, und ohne ihn wirkt eine frische Community
        // tot. Beide Zeilen einzeln umstellbar, ohne Code-Änderung.
        media: 'personal',
        // 'basic' ist der niedrigste Plan-Key (quota.plans oben) und damit
        // ein bewusstes „für alle" — die Zeile steht trotzdem hier, damit die
        // Zuordnung eine ENTSCHEIDUNG ist und nicht das Fehlen einer.
        activity: 'basic',
      },
    },
  },
  ui: {},
})
