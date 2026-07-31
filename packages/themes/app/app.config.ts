/**
 * themes meldet sein Customize theme bei der Admin-Modul-Registry an
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
          /**
           * E9: „Branding" ist Community-Sache (Davids Struktur: Branding =
           * Themes · Schriften) — deshalb scope 'community' und eine eigene
           * Gruppe statt des entfallenen 'design'.
           *
           * OFFEN und bewusst NICHT hier gelöst: die Seiten verlangen
           * `system.manage` (definePageMeta in themes/index|new|[id]|fonts),
           * und die trägt keine Community-Rolle — auf einem Mandanten-Host
           * sieht den Eintrag also nur der Betreiber. Die Capability auf
           * `branding.manage` zu ziehen ist ein Umbau von Seite UND Routen,
           * kein Umhängen; E9 verspricht im Menü nichts, was die Seite nicht
           * hält.
           */
          id: 'themes',
          scope: 'community',
          productKey: 'themes',
          labelKey: 'themes.customize.navLabel',
          icon: 'i-ph-palette',
          to: '/dashboard/themes',
          requiredCapability: 'system.manage',
          group: 'branding',
          order: 1,
          children: [
            { id: 'themes-gallery', labelKey: 'themes.customize.gallery', to: '/dashboard/themes', exact: true },
            { id: 'themes-fonts', labelKey: 'themes.fonts.navLabel', to: '/dashboard/themes/fonts' },
          ],
        },
      ],
    },
  },
})
