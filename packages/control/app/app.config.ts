/**
 * studio meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — Layer-Grenze A14.
 */
export default defineAppConfig({
  pukalani: {
    studio: {
      /** Das geteilte Pool-Appwrite-Projekt neuer Tenants (Onboarding-Default —
       *  der Betreiber tippt nur noch Name/Host, das Projekt füllt der Server). */
      defaultPoolProject: 'pool',
      // Plan-Katalog (P4-Rename 2026-07-26, Davids Pricing-Entscheid:
      // Basic 0 € / Personal 29 € / Pro 149 €, jährlich −25 %; Enterprise =
      // Studio-Angebot, KEIN Self-Service-Plan) — bewusst Code statt Table
      // (versioniert wie theme.catalog). features = VOR requires-Schluss
      // (moderation kommt z. B. über comments/posts mit); nur optional-tier
      // Features (foundation ist nie entitlement-gated). lookupKey =
      // Stripe-Price-lookup_key (scripts/stripe/ensure-prices.mjs legt die
      // Preise an und zieht Keys bei Betragsänderung auf neue Prices um).
      plans: {
        basic: { lookupKey: null, features: ['comments', 'pages'] },
        personal: { lookupKey: 'workspace_personal_monthly', lookupKeyYearly: 'workspace_personal_yearly', features: ['comments', 'pages', 'posts', 'activity', 'feedback'] },
        pro: { lookupKey: 'workspace_pro_monthly', lookupKeyYearly: 'workspace_pro_yearly', features: ['comments', 'pages', 'posts', 'activity', 'feedback', 'events', 'courses', 'tickets', 'media'] },
      },
    },
    admin: {
      modules: [
        {
          id: 'websites',
          featureKey: 'control',
          labelKey: 'admin.nav.websites',
          icon: 'i-ph-globe-hemisphere-west',
          to: '/dashboard/websites',
          requiredCapability: 'sites.manage',
          group: 'management',
          order: 1,
        },
        {
          id: 'workspaces',
          featureKey: 'control',
          labelKey: 'admin.nav.workspaces',
          icon: 'i-ph-briefcase',
          to: '/dashboard/workspaces',
          requiredCapability: 'sites.manage',
          group: 'management',
          order: 2,
        },
        {
          id: 'tenants',
          featureKey: 'control',
          labelKey: 'admin.nav.tenants',
          icon: 'i-ph-users-three',
          to: '/dashboard/tenants',
          requiredCapability: 'sites.manage',
          group: 'management',
          order: 3,
        },
        {
          // Die Warteschlange: wer hat Early Access angefragt, wem wurde ein
          // Code geschickt, wer hat ihn eingelöst. Steht VOR den Codes, weil
          // hier die tägliche Arbeit passiert.
          id: 'invite-requests',
          featureKey: 'control',
          labelKey: 'admin.nav.inviteRequests',
          icon: 'i-ph-envelope-simple',
          to: '/dashboard/requests',
          requiredCapability: 'sites.manage',
          group: 'management',
          order: 4,
        },
        {
          // Early-Access-Tor des Self-Service-Onboardings: hier stellt der
          // Betreiber die Codes aus, mit denen Fremde eine Community anlegen
          // dürfen. Ohne gültigen Code kommt niemand in den Wizard.
          id: 'invites',
          featureKey: 'control',
          labelKey: 'admin.nav.invites',
          icon: 'i-ph-key',
          to: '/dashboard/invites',
          requiredCapability: 'sites.manage',
          group: 'management',
          order: 5,
        },
      ],
    },
  },
})
