/**
 * posts meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged) — das Admin-Layout rendert sie
 * capability-gefiltert (Layer-Grenze A14).
 */
export default defineAppConfig({
  maui: {
    admin: {
      modules: [
        {
          id: 'posts',
          featureKey: 'posts',
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
