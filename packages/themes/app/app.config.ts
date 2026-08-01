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
           * DAS THEME-STUDIO IST BETREIBER-WERKZEUG (F5, 2026-07-31) — deshalb
           * `scope: 'operator'` und weiterhin `system.manage`.
           *
           * F5 stand als „auf branding.manage ziehen" in OPEN-ITEMS; am
           * Datenmodell nachgemessen wäre genau das ein Mandanten-Leck:
           * `custom_themes`, `custom_fonts` und `app_config.themeSettings`
           * gehören dem PROJEKT (Table-read(any), Live-Propagation an ALLE
           * Communities des Pools) — wer sie bearbeitet, ändert Voreinstellung,
           * Reihenfolge und Namen für jede fremde Community mit.
           *
           * Was einer Community gehört, ist die WAHL aus dem Built-in-Katalog
           * (`communities.theme/variant/neutral`). Die hat seit F5 ihre eigene
           * Fläche in derselben Nav-Gruppe: `/dashboard/branding` im
           * onboarding-Layer, `scope: 'community'`, `branding.manage`. Bis
           * dahin stand hier `scope: 'community'` — der Eintrag erschien damit
           * auf Mandanten-Hosts (wo nur der Betreiber-Break-Glass ihn öffnen
           * konnte) und fehlte auf dem KONTROLL-Host, wo der Betreiber
           * tatsächlich arbeitet. Beides ist jetzt herum.
           */
          id: 'themes',
          scope: 'operator',
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
