/**
 * media meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged). Das Admin-Layout rendert sie capability-
 * gefiltert — admin muss diesen Eintrag NICHT hart kennen (Layer-Grenze A14).
 */
export default defineAppConfig({
  maui: {
    admin: {
      modules: [
        {
          id: 'media',
          featureKey: 'media',
          labelKey: 'admin.nav.media',
          icon: 'i-ph-images',
          to: '/dashboard/media',
          requiredCapability: 'media.manage',
          group: 'design',
          order: 2,
        },
      ],
    },
  },
})
