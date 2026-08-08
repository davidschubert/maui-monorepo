/**
 * analytics meldet seinen Einstieg bei der Reiter-Registry des
 * Community-Hubs an (pukalani.admin.communityTabs, deep-merged) —
 * capability-gefiltert (A14).
 *
 * Bis F51 (2026-08-07) war das ein Sidebar-Modul in der Gruppe
 * „Settings · Community". Der Eintrag in `pukalani.admin.modules` ist
 * ersatzlos weg: die Statistik ist eine Einstellung DIESER Community, kein
 * eigenes Produkt mit Inhalten, und Davids Hub ist der EINE Ort dafür.
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      communityTabs: [
        {
          /**
           * BEWUSST OHNE `planProduct`: die anderen Tarif-gebundenen Einträge
           * (Beiträge, Events, Kurse) verschwinden, weil dahinter eine ganze
           * Arbeitsfläche liegt, die es für diesen Kunden nicht gibt. Hier
           * liegt ein einziges Feld — und die Antwort auf „warum sehe ich
           * keine Zahlen?" gehört auf DIESE Seite, nicht in ein leeres Menü.
           * Der Reiter bleibt also, die Seite sagt „ab Personal" und die
           * Route bleibt trotzdem zu (`requirePlanProduct`).
           *
           * `productKey` ist dagegen mit umgezogen — der Betreiber-Schalter
           * soll den Reiter genauso verschwinden lassen wie vorher den
           * Menüpunkt.
           */
          id: 'analytics',
          scope: 'community',
          productKey: 'analytics',
          labelKey: 'admin.nav.analytics',
          icon: 'i-ph-chart-line-up',
          to: '/dashboard/community/analytics',
          requiredCapability: 'community.analytics',
          order: 80,
        },
      ],
    },
  },
})
