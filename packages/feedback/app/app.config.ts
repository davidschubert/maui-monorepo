/**
 * feedback meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged) — das Admin-Layout rendert sie
 * capability-gefiltert (Layer-Grenze A14).
 */
export default defineAppConfig({
  maui: {
    admin: {
      modules: [
        {
          id: 'feedback',
          labelKey: 'admin.nav.feedback',
          icon: 'i-ph-megaphone-simple',
          to: '/dashboard/feedback',
          requiredCapability: 'feedback.manage',
        },
      ],
    },
  },
})
