/**
 * themes meldet sein Theme-Studio bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged) — das Dashboard rendert die Nav
 * capability-gefiltert, admin kennt den Eintrag nicht hart (A14).
 */
export default defineAppConfig({
  maui: {
    admin: {
      modules: [
        {
          id: 'themes',
          labelKey: 'themes.studio.navLabel',
          icon: 'i-ph-palette',
          to: '/dashboard/themes',
          requiredCapability: 'system.manage',
        },
      ],
    },
  },
})
