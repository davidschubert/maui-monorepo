/**
 * studio meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged) — Layer-Grenze A14.
 */
export default defineAppConfig({
  maui: {
    studio: {
      /** Das geteilte Pool-Appwrite-Projekt neuer Tenants (Onboarding-Default —
       *  der Betreiber tippt nur noch Name/Host, das Projekt füllt der Server). */
      defaultPoolProject: 'pool',
      // M8-Plan-Katalog (Check-in 2026-07-19: free/pro/business) — bewusst
      // Code statt Table (versioniert wie theme.catalog). features = VOR
      // requires-Schluss (moderation kommt z. B. über comments/posts mit);
      // nur optional-tier Features (foundation ist nie entitlement-gated).
      // lookupKey = Stripe-Price-lookup_key (billing-Muster: Test-/Live-Mode
      // ohne Codeänderung; Preis in Stripe anlegen und Key vergeben).
      plans: {
        free: { lookupKey: null, features: ['comments'] },
        pro: { lookupKey: 'workspace_pro_monthly', lookupKeyYearly: 'workspace_pro_yearly', features: ['comments', 'posts', 'events', 'activity', 'feedback'] },
        business: { lookupKey: 'workspace_business_monthly', lookupKeyYearly: 'workspace_business_yearly', features: ['comments', 'posts', 'events', 'activity', 'feedback', 'courses', 'tickets', 'media'] },
      },
    },
    admin: {
      modules: [
        {
          id: 'sites',
          featureKey: 'control',
          labelKey: 'admin.nav.sites',
          icon: 'i-ph-globe-hemisphere-west',
          to: '/dashboard/sites',
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
