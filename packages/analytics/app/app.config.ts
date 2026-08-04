/**
 * analytics meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — capability-gefiltert (A14).
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      modules: [
        {
          /**
           * E9-Gruppe „Settings · Community": die Statistik ist eine
           * Einstellung DIESER Community, kein eigenes Produkt mit Inhalten.
           * Sie steht neben Moderation, Einbettung und Mitgliedern.
           *
           * BEWUSST OHNE `planProduct`: die anderen Tarif-gebundenen Einträge
           * (Beiträge, Events, Kurse) verschwinden, weil dahinter eine ganze
           * Arbeitsfläche liegt, die es für diesen Kunden nicht gibt. Hier
           * liegt ein einziges Feld — und die Antwort auf „warum sehe ich
           * keine Zahlen?" gehört auf DIESE Seite, nicht in ein leeres Menü.
           * Der Menüpunkt bleibt also, die Seite sagt „ab Personal" und die
           * Route bleibt trotzdem zu (`requirePlanProduct`).
           */
          id: 'analytics',
          scope: 'community',
          productKey: 'analytics',
          labelKey: 'admin.nav.analytics',
          icon: 'i-ph-chart-line-up',
          to: '/dashboard/analytics',
          requiredCapability: 'community.analytics',
          group: 'settings',
          // Nach Abo (1), Moderation (2) und Einbettung (3), vor Mitglieder (5).
          order: 4,
        },
      ],
    },
  },
})
