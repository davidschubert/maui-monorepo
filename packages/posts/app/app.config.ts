/**
 * posts meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — das Admin-Layout rendert sie
 * capability-gefiltert (Layer-Grenze A14).
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      modules: [
        {
          // E9: Inhalte einer Community (Gruppe „Produkte"). Im Silo dieselbe
          // Seite für den Betreiber — die Ausnahme ohne Mandanten trägt das.
          id: 'posts',
          scope: 'community',
          productKey: 'posts',
          labelKey: 'admin.nav.posts',
          icon: 'i-ph-users-three',
          to: '/dashboard/posts',
          requiredCapability: 'posts.moderate',
          group: 'products',
          order: 1,
        },
      ],
    },
  },
})
