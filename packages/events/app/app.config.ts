/**
 * events meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — das Admin-Layout rendert sie
 * capability-gefiltert (Layer-Grenze A14) — und seit C4 (2026-07-31) auch
 * seinen ÖFFENTLICHEN Nav-Eintrag in der Chrome-Registry.
 */
export default defineAppConfig({
  pukalani: {
    /**
     * Kauf-Endpunkt für bezahlte Events als Pfad-Template mit `{id}`
     * (z. B. '/api/events/{id}/checkout'). Leer = kein Kauf.
     *
     * WARUM CONFIG UND NICHT FEST VERDRAHTET: die Route gehört der APP, die
     * events + billing komponiert (A14 — die Layer kennen sich nicht); heute
     * ist das nur apps/comments. Im Pool existiert sie nicht (D1: bezahlte
     * Events sind dort gesperrt). Der Default '' hält den CTA fail-closed auf
     * „Bald verfügbar" (EventDetail), statt einen Kauf in einen 404 zu
     * schicken. Konsument ist die Bauplan-Komposition
     * packages/blueprint/app/pages/events/[id].vue.
     */
    events: {
      ticketCheckoutPath: '',
    },
    chrome: {
      nav: {
        // C4 (2026-07-31): stand bis dahin in apps/comments/app/app.config.ts —
        // damit hatte der Pool den Menüpunkt nicht, obwohl er den Layer zieht.
        // Jetzt bekommt ihn JEDE App, die events extended; App-Overrides
        // bleiben möglich (Objekt-Map, Key = stabile ID ⇒ Dedup inklusive).
        // planProduct: im Pool erst ab Pro (pukalani.tenancy.products) +
        // Plan-Badge auf Demo-Hosts; im Silo ohne Tenant-Plan wirkungslos.
        events: { labelKey: 'events.list.title', to: '/events', icon: 'i-ph-calendar-dots', order: 20, productKey: 'events', planProduct: 'events' },
      },
    },
    admin: {
      modules: [
        {
          // E9: Inhalte einer Community (Gruppe „Produkte")
          id: 'events',
          scope: 'community',
          productKey: 'events',
          // C2: im Pool erst ab Pro (pukalani.tenancy.products) — ohne das
          // Feld stand der Menüpunkt auch dort, wo /api/events längst 404t.
          planProduct: 'events',
          labelKey: 'admin.nav.events',
          icon: 'i-ph-calendar-dots',
          to: '/dashboard/events',
          requiredCapability: 'events.manage',
          group: 'products',
          order: 3,
        },
        {
          // F15: ZWEI Einträge auf dasselbe Produkt — dieselbe Begründung wie bei
          // posts (C16). Eine Registrierung trägt genau EINE `requiredCapability`,
          // und die Zielgruppen überschneiden sich nicht: ein Editor hat
          // `events.manage` OHNE `events.moderate`, ein Moderator umgekehrt
          // (communityAuthz.ts — Editor und Moderator sind Geschwister, kein
          // Chain). Ein einzelner Eintrag müsste sich für eine der beiden
          // entscheiden und ließe die andere Rolle vor einer Wand stehen — genau
          // so wäre `events.moderate` vom ersten Tag an eine Capability ohne
          // Fläche gewesen. Admin und Owner halten beide und sehen beide Einträge;
          // das ist richtig, es sind zwei Aufgaben (eigene Termine pflegen vs.
          // fremde beurteilen).
          id: 'events-moderation',
          scope: 'community',
          productKey: 'events',
          planProduct: 'events',
          labelKey: 'admin.nav.eventsModeration',
          icon: 'i-ph-flag',
          to: '/dashboard/events-moderation',
          requiredCapability: 'events.moderate',
          group: 'products',
          order: 4,
        },
      ],
    },
  },
})
