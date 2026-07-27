/**
 * activity meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged). Das Admin-Layout rendert sie capability-
 * gefiltert — admin muss diesen Eintrag NICHT hart kennen (Layer-Grenze A14).
 */
export default defineAppConfig({
  maui: {
    // Chrome-Registry (S9): Aktivitäts-Slideover im Header + Nav-Link —
    // beides nur eingeloggt und nur solange das Feature an ist (F2).
    chrome: {
      nav: {
        activity: { labelKey: 'activity.title', to: '/activity', icon: 'i-ph-pulse', order: 40, featureKey: 'activity', requiresAuth: true },
      },
      utilities: {
        activity: { component: 'ActivitySlideover', order: 10, featureKey: 'activity', requiresAuth: true },
      },
    },
    admin: {
      // Form entspricht MauiAdminModule (core/shared) — der Typ ist in app.config
      // nicht auto-importiert; das Layout liest die Registry typisiert (core-Default).
      modules: [
        {
          id: 'activity',
          featureKey: 'activity',
          labelKey: 'admin.nav.activity',
          icon: 'i-ph-pulse',
          to: '/dashboard/activity',
          requiredCapability: 'activity.manage',
          group: 'products',
          order: 4,
        },
      ],
    },
  },
})
