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
          group: 'design',
          children: [
            { id: 'themes-gallery', labelKey: 'themes.studio.gallery', to: '/dashboard/themes', exact: true },
            { id: 'themes-fonts', labelKey: 'themes.fonts.navLabel', to: '/dashboard/themes/fonts' },
          ],
        },
      ],
    },
  },
})
