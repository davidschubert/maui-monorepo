/**
 * activity meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged). Das Admin-Layout rendert sie capability-
 * gefiltert — admin muss diesen Eintrag NICHT hart kennen (Layer-Grenze A14).
 */
export default defineAppConfig({
  pukalani: {
    // Chrome-Registry (S9): Aktivitäts-Slideover im Header + Nav-Link —
    // beides nur eingeloggt und nur solange das Produkt an ist (F2).
    chrome: {
      nav: {
        // planProduct: im Pool ab basic (pukalani.tenancy.products) — heute
        // also für alle. Das Feld steht trotzdem da, damit eine spätere
        // Umstellung im Katalog Menü und Route gemeinsam bewegt.
        activity: { labelKey: 'activity.title', to: '/activity', icon: 'i-ph-pulse', order: 40, productKey: 'activity', planProduct: 'activity', requiresAuth: true },
      },
      utilities: {
        activity: { component: 'ActivitySlideover', order: 10, productKey: 'activity', requiresAuth: true },
      },
    },
    admin: {
      // Form entspricht PukalaniAdminModule (core/shared) — der Typ ist in app.config
      // nicht auto-importiert; das Layout liest die Registry typisiert (core-Default).
      modules: [
        {
          // E9: „Settings · Audience → Activity logs" (Davids Struktur) — das
          // Protokoll gehört der Community, deren Publikum es beschreibt.
          id: 'activity',
          scope: 'community',
          productKey: 'activity',
          // C2: im Pool ab basic (pukalani.tenancy.products) — heute für alle;
          // das Feld hält Menü und Route zusammen, falls die Zuordnung steigt.
          planProduct: 'activity',
          labelKey: 'admin.nav.activity',
          icon: 'i-ph-pulse',
          to: '/dashboard/activity',
          requiredCapability: 'activity.manage',
          group: 'settings',
          order: 4,
        },
      ],
    },
  },
})
