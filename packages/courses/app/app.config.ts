/**
 * courses meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — capability-gefiltert (A14).
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      modules: [
        {
          id: 'courses',
          productKey: 'courses',
          labelKey: 'admin.nav.courses',
          icon: 'i-ph-graduation-cap',
          to: '/dashboard/courses',
          requiredCapability: 'courses.manage',
          group: 'products',
          order: 3,
        },
      ],
    },
  },
})
