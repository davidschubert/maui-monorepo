/**
 * courses meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged) — capability-gefiltert (A14).
 */
export default defineAppConfig({
  maui: {
    admin: {
      modules: [
        {
          id: 'courses',
          labelKey: 'admin.nav.courses',
          icon: 'i-ph-graduation-cap',
          to: '/dashboard/courses',
          requiredCapability: 'courses.manage',
        },
      ],
    },
  },
})
