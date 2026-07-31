/**
 * pages meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — capability-gefiltert (A14).
 */
export default defineAppConfig({
  pukalani: {
    // Chrome-Registry (S9): pages ist die CMS-Nav-Quelle — das blueprint-
    // Layout holt /api/pages/public NUR, wenn dieses Flag (= dieser Layer)
    // da ist. Veröffentlichte Seiten erscheinen in der Haupt-Nav, Seiten mit
    // Legal-Slugs (imprint/impressum/privacy/datenschutz) im Footer.
    chrome: {
      pagesNav: true,
    },
    admin: {
      modules: [
        {
          id: 'pages',
          productKey: 'pages',
          labelKey: 'admin.nav.pages',
          icon: 'i-ph-file-text',
          to: '/dashboard/pages',
          requiredCapability: 'pages.manage',
          group: 'management',
          order: 5,
        },
      ],
    },
  },
})
