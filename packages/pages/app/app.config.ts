/**
 * pages meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged) — capability-gefiltert (A14).
 */
export default defineAppConfig({
  maui: {
    admin: {
      modules: [
        {
          id: 'pages',
          featureKey: 'pages',
          labelKey: 'admin.nav.pages',
          icon: 'i-ph-file-text',
          to: '/dashboard/pages',
          requiredCapability: 'pages.manage',
          group: 'management',
          order: 5,
        },
      ],
    },
  },
})
