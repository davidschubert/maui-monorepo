/**
 * studio meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged) — Layer-Grenze A14.
 */
export default defineAppConfig({
  maui: {
    studio: {
      // M8-Plan-Katalog (Check-in 2026-07-19: free/pro/business) — bewusst
      // Code statt Table (versioniert wie theme.catalog). features = VOR
      // requires-Schluss (moderation kommt z. B. über comments/posts mit);
      // nur optional-tier Features (foundation ist nie entitlement-gated).
      // lookupKey = Stripe-Price-lookup_key (billing-Muster: Test-/Live-Mode
      // ohne Codeänderung; Preis in Stripe anlegen und Key vergeben).
      plans: {
        free: { lookupKey: null, features: ['comments'] },
        pro: { lookupKey: 'workspace_pro_monthly', features: ['comments', 'posts', 'events', 'activity', 'feedback'] },
        business: { lookupKey: 'workspace_business_monthly', features: ['comments', 'posts', 'events', 'activity', 'feedback', 'courses', 'tickets', 'media'] },
      },
    },
    admin: {
      modules: [
        {
          id: 'sites',
          featureKey: 'studio',
          labelKey: 'admin.nav.sites',
          icon: 'i-ph-globe-hemisphere-west',
          to: '/dashboard/sites',
          requiredCapability: 'sites.manage',
          group: 'management',
          order: 1,
        },
      ],
    },
  },
})
