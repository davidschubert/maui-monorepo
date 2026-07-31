/**
 * themes meldet sein Theme-Studio bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — das Dashboard rendert die Nav
 * capability-gefiltert, admin kennt den Eintrag nicht hart (A14).
 * Zusätzlich Chrome-Registry (S9/K7): das DisplaySettingsMenu (Theme/
 * Variante/Appearance/SPRACHE) ist überall dort das Sprach-UI, wo themes
 * extended ist — es ersetzt den CoreLocaleSwitcher im Community-Layout.
 */
export default defineAppConfig({
  pukalani: {
    chrome: {
      utilities: {
        displaySettings: { component: 'DisplaySettingsMenu', order: 30 },
      },
    },
    admin: {
      modules: [
        {
          id: 'themes',
          productKey: 'themes',
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
