/**
 * control meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — Layer-Grenze A14.
 */
export default defineAppConfig({
  pukalani: {
    control: {
      /** Das geteilte Pool-Appwrite-Projekt neuer Tenants (Onboarding-Default —
       *  der Betreiber tippt nur noch Name/Host, das Projekt füllt der Server). */
      defaultPoolProject: 'pool',
      // Plan-Katalog der COMMUNITY (P4-Rename 2026-07-26, Davids Pricing-Entscheid:
      // Basic 0 € / Personal 29 € / Pro 149 €, jährlich −25 %; Enterprise =
      // Studio-Angebot, KEIN Self-Service-Plan) — bewusst Code statt Table
      // (versioniert wie theme.catalog). products = VOR requires-Schluss
      // (moderation kommt z. B. über comments/posts mit); nur optional-tier
      // Produkte (foundation ist nie entitlement-gated). lookupKey =
      // Stripe-Price-lookup_key (scripts/stripe/ensure-prices.mjs legt die
      // Preise an und zieht Keys bei Betragsänderung auf neue Prices um).
      // Die Keys heißen weiterhin `workspace_*` — das sind IDENTITÄTEN bei
      // Stripe (Test- und Live-Mode), kein Wort: umbenennen hieße, die
      // angelegten Preise nicht mehr zu finden.
      plans: {
        basic: { lookupKey: null, products: ['comments', 'pages'] },
        personal: { lookupKey: 'workspace_personal_monthly', lookupKeyYearly: 'workspace_personal_yearly', products: ['comments', 'pages', 'posts', 'activity', 'feedback'] },
        pro: { lookupKey: 'workspace_pro_monthly', lookupKeyYearly: 'workspace_pro_yearly', products: ['comments', 'pages', 'posts', 'activity', 'feedback', 'events', 'courses', 'tickets', 'media'] },
      },
    },
    admin: {
      /**
       * E9: ALLE Einträge dieses Layers sind `scope: 'operator'` — das Control
       * Plane verwaltet die Plattform, nicht eine Community. Auf einem
       * Mandanten-Host verschwinden sie deshalb vollständig (der Layer wird
       * dort ohnehin nicht extended, die Ebene ist trotzdem die richtige
       * Aussage). Gruppen nach Davids Struktur: „Plattform" = die Communities
       * und ihr Zugang, „Studio" = die Websites des Betreibers.
       */
      modules: [
        {
          // Communities · Overview — steht an erster Stelle der Plattform:
          // das ist der Bestand, alles andere führt hierher.
          id: 'tenants',
          scope: 'operator',
          productKey: 'control',
          labelKey: 'admin.nav.tenants',
          icon: 'i-ph-users-three',
          to: '/dashboard/tenants',
          requiredCapability: 'sites.manage',
          group: 'platform',
          order: 1,
        },
        {
          // Die Warteschlange: wer hat Early Access angefragt, wem wurde ein
          // Code geschickt, wer hat ihn eingelöst. Steht VOR den Codes, weil
          // hier die tägliche Arbeit passiert.
          id: 'invite-requests',
          scope: 'operator',
          productKey: 'control',
          labelKey: 'admin.nav.inviteRequests',
          icon: 'i-ph-envelope-simple',
          to: '/dashboard/requests',
          requiredCapability: 'sites.manage',
          group: 'platform',
          order: 2,
        },
        {
          // Early-Access-Tor des Self-Service-Onboardings: hier stellt der
          // Betreiber die Codes aus, mit denen Fremde eine Community anlegen
          // dürfen. Ohne gültigen Code kommt niemand in den Wizard.
          id: 'invites',
          scope: 'operator',
          productKey: 'control',
          labelKey: 'admin.nav.invites',
          icon: 'i-ph-key',
          to: '/dashboard/invites',
          requiredCapability: 'sites.manage',
          group: 'platform',
          order: 3,
        },
        {
          // Gesperrte Namen: die Code-Basisliste (RESERVED_SUBDOMAINS) zum
          // Nachsehen plus die eigenen Einträge zum Ergänzen (control-027).
          // Steht am Ende der Plattform-Gruppe — man schaut selten hin, aber
          // wenn, dann dringend.
          id: 'reserved-names',
          scope: 'operator',
          productKey: 'control',
          labelKey: 'admin.nav.reservedNames',
          icon: 'i-ph-prohibit',
          to: '/dashboard/reserved-names',
          requiredCapability: 'sites.manage',
          group: 'platform',
          order: 4,
        },
        {
          // Studio = das Kundenangebot des Betreibers (Davids Wort, nicht
          // „Instanzen"). Eigene Gruppe, weil eine Website kein Mandant ist.
          id: 'websites',
          scope: 'operator',
          productKey: 'control',
          labelKey: 'admin.nav.websites',
          icon: 'i-ph-globe-hemisphere-west',
          to: '/dashboard/websites',
          requiredCapability: 'sites.manage',
          group: 'studio',
          order: 1,
        },
      ],
    },
  },
})
