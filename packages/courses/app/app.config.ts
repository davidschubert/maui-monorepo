/**
 * courses meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — capability-gefiltert (A14) — und
 * seit C4 (2026-07-31) auch seinen ÖFFENTLICHEN Nav-Eintrag in der
 * Chrome-Registry.
 */
export default defineAppConfig({
  pukalani: {
    chrome: {
      nav: {
        // C4 (2026-07-31): stand bis dahin in apps/comments/app/app.config.ts —
        // damit hatte der Pool den Menüpunkt nicht, obwohl er den Layer zieht.
        // requiresAuth: Kurse sind nur eingeloggt sichtbar (Gate wie im alten
        // App-Layout). planProduct: im Pool erst ab Pro.
        courses: { labelKey: 'courses.list.title', to: '/courses', icon: 'i-ph-graduation-cap', order: 30, productKey: 'courses', planProduct: 'courses', requiresAuth: true },
      },
    },
    admin: {
      modules: [
        {
          // E9: Inhalte einer Community (Gruppe „Produkte")
          id: 'courses',
          scope: 'community',
          productKey: 'courses',
          // C2: im Pool erst ab Pro (pukalani.tenancy.products) — ohne das
          // Feld stand der Menüpunkt auch dort, wo /api/courses längst 404t.
          planProduct: 'courses',
          labelKey: 'admin.nav.courses',
          icon: 'i-ph-graduation-cap',
          to: '/dashboard/courses',
          requiredCapability: 'courses.manage',
          group: 'products',
          order: 4,
        },
      ],
    },
  },
})
