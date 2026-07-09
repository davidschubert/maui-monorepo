/**
 * tickets meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged) — das Layout rendert sie
 * capability-gefiltert (Layer-Grenze A14).
 */
export default defineAppConfig({
  maui: {
    admin: {
      modules: [
        {
          id: 'tickets',
          labelKey: 'admin.nav.tickets',
          icon: 'i-ph-kanban',
          to: '/dashboard/tickets',
          requiredCapability: 'tickets.manage',
          group: 'products',
        },
      ],
    },
  },
})
