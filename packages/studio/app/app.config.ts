/**
 * studio meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged) — Layer-Grenze A14.
 */
export default defineAppConfig({
  maui: {
    admin: {
      modules: [
        {
          id: 'sites',
          labelKey: 'admin.nav.sites',
          icon: 'i-ph-globe-hemisphere-west',
          to: '/dashboard/sites',
          requiredCapability: 'sites.manage',
          group: 'management',
          order: 1,
        },
      ],
    },
  },
})
