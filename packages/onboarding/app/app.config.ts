/**
 * onboarding meldet die COMMUNITY-Verwaltung bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — Mitglieder (`team.manage`), Abo
 * (`community.billing`) und seit F5 das Erscheinungsbild (`branding.manage`),
 * jeder Eintrag capability-gefiltert.
 *
 * WARUM DIESER LAYER: die Seite kann nur so weit reichen wie ihre Routen, und die
 * liegen hier (`/api/community/members/*`) — dieser Layer besitzt die Service-Naht zum
 * Control Plane, dem `community_members`/`community_invites` gehören. Läge der Eintrag im
 * admin-Layer, hätte die Silo-App (apps/comments, ohne onboarding) einen
 * Menüpunkt, dessen Seite ins Leere greift. Eine Silo-Instanz hat auch keine
 * Community-Grenze: dort verwaltet der Betreiber Nutzer über /dashboard/users.
 *
 * `team.manage` war bis heute eine TOTE Capability (Audit-Befund S9): in der
 * Matrix vorhanden, im Dashboard ohne Einstieg. Dieser Eintrag ist der Einstieg.
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      modules: [
        {
          // E9: Mitglieder sind Community-Sache (Davids Struktur: Settings →
          // Mitglieder). Auf einem Kontroll-Host verschwindet der Eintrag —
          // dort gibt es keine Community, deren Team man verwalten könnte.
          id: 'members',
          scope: 'community',
          labelKey: 'admin.nav.members',
          icon: 'i-ph-users-three',
          to: '/dashboard/members',
          requiredCapability: 'team.manage',
          group: 'settings',
          order: 5,
        },
        {
          /**
           * BRANDING DER COMMUNITY (F5, 2026-07-31) — die Fläche, die der
           * Nav-Gruppe „Branding" für Community-Rollen fehlte. `branding.manage`
           * war bis heute eine tote Capability: in der Matrix (owner + admin),
           * im Menü ohne Einstieg, weil dort nur das Theme-Studio stand und das
           * `system.manage` verlangt.
           *
           * Der SCHNITT: Wahl ≠ Katalog. Hier wählt eine Community aus dem
           * Built-in-Katalog (`communities.theme/variant/neutral`); der Katalog
           * selbst (custom_themes/custom_fonts/themeSettings — INSTANZ-weit,
           * read(any), live an alle) bleibt Betreiber-Sache unter
           * /dashboard/themes. Begründung im Kopf der Seite.
           *
           * In DIESEM Layer aus demselben Grund wie die Mitglieder: die Seite
           * lebt von `/api/community/branding`, und die braucht die
           * Service-Naht zum Control Plane.
           */
          id: 'community-branding',
          scope: 'community',
          labelKey: 'branding.navLabel',
          icon: 'i-ph-palette',
          to: '/dashboard/branding',
          requiredCapability: 'branding.manage',
          group: 'branding',
          order: 1,
        },
        {
          /**
           * Abo & Rechnung der Community (A6 Schritt 3). Aus DEMSELBEN Grund in
           * diesem Layer wie die Mitglieder: die Seite lebt von
           * `/api/community/billing/*`, und die brauchen die Service-Naht zum Control
           * Plane. `community.billing` trägt nur der Owner — ein Admin sieht den
           * Punkt gar nicht erst.
           *
           * Der Pfad liegt unter /dashboard/settings, weil der Stripe-Checkout
           * genau dorthin zurückführt (Erfolgs-/Abbruch-URL aus tenants.host).
           */
          id: 'site-subscription',
          scope: 'community',
          labelKey: 'onboarding.nav.subscription',
          icon: 'i-ph-credit-card',
          to: '/dashboard/settings/subscription',
          requiredCapability: 'community.billing',
          group: 'settings',
          order: 1,
        },
      ],
      /**
       * REITER der Einstellungs-Hülle (F24, 2026-08-02) — die Registry neben
       * `modules`, weil es eine andere Fläche ist: `modules` füllt die
       * Seitenleiste, das hier die Reiter-Zeile INNERHALB von
       * /dashboard/settings.
       *
       * Aus DEMSELBEN Grund in diesem Layer wie Mitglieder, Branding und Abo:
       * die Seite `/dashboard/settings/community` lebt von
       * `/api/community/{registration,audience,delete}`, und die brauchen die
       * Service-Naht zum Control Plane. Bis heute stand der Reiter fest in
       * packages/admin/app/pages/dashboard/settings.vue — eine Silo-App ohne
       * onboarding hatte ihn damit im Bauplan und wurde nur zur Laufzeit davor
       * bewahrt.
       *
       * `team.manage` wie bei den Mitgliedern: wer das Team verwaltet, setzt
       * auch die Zugangsregeln. Die Gefahrenzone INNERHALB der Seite verlangt
       * zusätzlich `community.delete` (Owner) — ein Admin sieht den Reiter,
       * aber nicht die Löschen-Karte.
       */
      settingsTabs: [
        {
          id: 'community',
          scope: 'community',
          labelKey: 'dashboard.settings.community',
          icon: 'i-ph-users-three',
          to: '/dashboard/settings/community',
          requiredCapability: 'team.manage',
          order: 10,
        },
        {
          /**
           * EIGENE DOMAIN (control-035, Davids Entscheidungen vom 2026-08-07).
           *
           * In DIESEM Layer aus demselben Grund wie alle Nachbarn: die Seite
           * lebt von `/api/community/domain/*`, und die brauchen die
           * Service-Naht zum Control Plane, dem `communities` gehört.
           *
           * `community.domain` trägt nur der OWNER — ein Admin sieht den
           * Reiter gar nicht erst. Die AUTORITÄT ist trotzdem der Server: die
           * Routen prüfen dieselbe Capability, und das Control Plane prüft sie
           * danach noch einmal selbst.
           *
           * KEIN Plan-Gate am Reiter, obwohl das Merkmal ab Pro ist (Davids
           * Entscheidung 1): ein Owner soll ERFAHREN, dass es eigene Domains
           * gibt. Die Seite selbst zeigt ihm dann, was ihm fehlt, und verlinkt
           * aufs Abo. Ein Reiter, der bei Basic verschwindet, verkauft nichts
           * und erklärt nichts.
           */
          id: 'community-domain',
          scope: 'community',
          labelKey: 'onboarding.domain.navLabel',
          icon: 'i-ph-globe-hemisphere-west',
          to: '/dashboard/settings/domain',
          requiredCapability: 'community.domain',
          order: 20,
        },
      ],
      /**
       * Der Hinweis auf die ablaufende Testphase (M13). Aus DEMSELBEN Grund in
       * diesem Layer wie die Abo-Seite: er lebt von `/api/community/billing/trial`,
       * und die braucht den Mandanten-Kontext, den nur eine Pool-App hat. Eine
       * Silo-App ohne onboarding trägt den Eintrag nicht — dort gibt es keine
       * Testphase, also erscheint auch nichts.
       *
       * Dieselbe Capability wie die Abo-Seite, auf die er zeigt: `community.billing`
       * trägt nur der Owner. Ein Moderator bekäme sonst einen Hinweis mit einem
       * Knopf in ein 403 — und eine Auskunft über den Vertrag seiner Community,
       * die ihn nichts angeht.
       */
      notices: {
        /**
         * Die Sperre steht VOR der Testphase (M13): eine nur-lesende Community
         * ist die dringlichere Nachricht, und beides gleichzeitig gibt es
         * praktisch nicht — eine Testphase kann nichts schulden. Dieselbe
         * Capability wie die Abo-Seite, auf die der Knopf zeigt.
         */
        communitySuspension: {
          component: 'CommunitySuspensionNotice',
          requiredCapability: 'community.billing',
          order: 5,
        },
        communityTrial: {
          component: 'CommunityTrialNotice',
          requiredCapability: 'community.billing',
          order: 10,
        },
      },
    },
  },
})
