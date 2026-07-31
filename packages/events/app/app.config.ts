/**
 * events meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — das Admin-Layout rendert sie
 * capability-gefiltert (Layer-Grenze A14).
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      modules: [
        {
          id: 'events',
          productKey: 'events',
          labelKey: 'admin.nav.events',
          icon: 'i-ph-calendar-dots',
          to: '/dashboard/events',
          requiredCapability: 'events.manage',
          group: 'products',
          order: 2,
        },
      ],
    },
  },
})
