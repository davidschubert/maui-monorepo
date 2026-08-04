/**
 * pages meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — capability-gefiltert (A14).
 */
export default defineAppConfig({
  pukalani: {
    pages: {
      /**
       * Fehlt die Regeln-Seite, liefern die Routen die Vorlage aus und das
       * Dashboard bietet sie zum Bearbeiten an (F1, Davids Entscheidung 2 —
       * Begründung in shared/guidelinesFallback.ts, Schalter-Begründung in
       * server/utils/guidelinesFallbackGate.ts).
       *
       * Layer-Default AUS: dieser Layer läuft auch in `control`, wo der
       * BETREIBER seine eigenen Rechtstexte pflegt und Community-Regeln
       * niemanden meinen. Eingeschaltet wird er dort, wo die Seiten einer
       * Community gehören (apps/platform).
       */
      guidelinesFallback: false,
    },
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
          // E9: die Seiten SIND die Website einer Community (eigene Gruppe
          // „Website"; „Navigation" kommt später als zweiter Eintrag dazu).
          // scope 'community', weil sie einer Community gehören — im
          // Einzelbetrieb (apps/control pflegt hier seine Rechtstexte) bleibt
          // der Eintrag über das Operator-Label sichtbar.
          id: 'pages',
          scope: 'community',
          productKey: 'pages',
          labelKey: 'admin.nav.pages',
          icon: 'i-ph-file-text',
          to: '/dashboard/pages',
          requiredCapability: 'pages.manage',
          group: 'website',
          order: 1,
        },
      ],
    },
  },
})
