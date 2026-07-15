/**
 * feed meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged). Das Admin-Layout rendert sie capability-
 * gefiltert — admin muss diesen Eintrag NICHT hart kennen (Layer-Grenze A14).
 */
export default defineAppConfig({
  maui: {
    admin: {
      // Form entspricht MauiAdminModule (core/shared) — der Typ ist in app.config
      // nicht auto-importiert; das Layout liest die Registry typisiert (core-Default).
      modules: [
        {
          id: 'feed',
          labelKey: 'admin.nav.feed',
          icon: 'i-ph-pulse',
          to: '/dashboard/feed',
          requiredCapability: 'feed.manage',
          group: 'products',
          order: 4,
        },
      ],
    },
  },
})
