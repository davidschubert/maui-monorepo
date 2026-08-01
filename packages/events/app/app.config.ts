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
          // E9: Inhalte einer Community (Gruppe „Produkte")
          id: 'events',
          scope: 'community',
          productKey: 'events',
          // C2: im Pool erst ab Pro (pukalani.tenancy.products) — ohne das
          // Feld stand der Menüpunkt auch dort, wo /api/events längst 404t.
          planProduct: 'events',
          labelKey: 'admin.nav.events',
          icon: 'i-ph-calendar-dots',
          to: '/dashboard/events',
          requiredCapability: 'events.manage',
          group: 'products',
          order: 3,
        },
      ],
    },
  },
})
