/**
 * onboarding meldet die COMMUNITY-Verwaltung an — seit F51 (2026-08-07,
 * Davids Community-Settings-Hub) vollständig als REITER in
 * `pukalani.admin.communityTabs`, nicht mehr als Sidebar-Module.
 *
 * WAS SICH GEÄNDERT HAT: die drei Sidebar-Einträge `members`,
 * `community-branding` und `site-subscription` sind ERSATZLOS gestrichen —
 * ersatzlos in der Seitenleiste, versteht sich; ihre Flächen leben als Reiter
 * unter `/dashboard/community/*` weiter. Grund ist Davids Entscheidung, dass
 * es EINEN Einstieg „Community-Einstellungen" gibt statt fünf verstreuter
 * Menüpunkte in drei Nav-Gruppen. Wer hier einen Punkt ZURÜCK in `modules`
 * legt, hat ihn danach doppelt.
 *
 * WARUM DIESER LAYER: die Seiten können nur so weit reichen wie ihre Routen,
 * und die liegen hier (`/api/community/*`) — dieser Layer besitzt die
 * Service-Naht zum Control Plane, dem `communities`, `community_members` und
 * `community_invites` gehören. Läge ein Eintrag im admin-Layer, hätte die
 * Silo-App (apps/comments, ohne onboarding) einen Einstieg, dessen Seite ins
 * Leere greift. Eine Silo-Instanz hat auch keine Community-Grenze: dort
 * verwaltet der Betreiber Nutzer über /dashboard/users.
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      /**
       * REITER DES COMMUNITY-HUBS (F51). Reihenfolge = `order`, gerendert von
       * packages/admin/app/pages/dashboard/community.vue, gefiltert mit
       * `resolveSettingsTabs` (Ort × Capability × Produkt-Gates).
       *
       * Alle sind `scope: 'community'`: auf einem Kontroll-Host verschwinden
       * sie, und mit ihnen der Menüpunkt — dort gibt es keine Community, deren
       * Einstellungen das wären.
       */
      communityTabs: [
        {
          /**
           * ALLGEMEIN — die Zugangsregeln (offene Registrierung, Sichtbarkeit)
           * und die Gefahrenzone. Der INDEX der Hülle: `/dashboard/community`
           * ohne Unterpfad.
           *
           * `team.manage` wie bei den Mitgliedern: wer das Team verwaltet, setzt
           * auch die Zugangsregeln. Die Gefahrenzone INNERHALB der Seite
           * verlangt zusätzlich `community.delete` (Owner) — ein Admin sieht den
           * Reiter, aber nicht die Löschen-Karte.
           */
          id: 'community',
          scope: 'community',
          labelKey: 'onboarding.communityTabs.general',
          icon: 'i-ph-sliders-horizontal',
          to: '/dashboard/community',
          requiredCapability: 'team.manage',
          order: 10,
        },
        {
          /**
           * BRANDING DER COMMUNITY (F5, 2026-07-31). `branding.manage` war bis
           * dahin eine tote Capability: in der Matrix (owner + admin), im Menü
           * ohne Einstieg, weil dort nur das Theme-Studio stand und das
           * `system.manage` verlangt.
           *
           * Der SCHNITT: Wahl ≠ Katalog. Hier wählt eine Community aus dem
           * Built-in-Katalog (`communities.theme/variant/neutral`); der Katalog
           * selbst (custom_themes/custom_fonts/themeSettings — INSTANZ-weit,
           * read(any), live an alle) bleibt Betreiber-Sache unter
           * /dashboard/themes. Begründung im Kopf der Seite.
           */
          id: 'community-branding',
          scope: 'community',
          labelKey: 'branding.navLabel',
          icon: 'i-ph-palette',
          to: '/dashboard/community/branding',
          requiredCapability: 'branding.manage',
          order: 20,
        },
        {
          /**
           * MITGLIEDER. `team.manage` war bis zum Audit-Befund S9 eine TOTE
           * Capability: in der Matrix vorhanden, im Dashboard ohne Einstieg.
           * Dieser Eintrag ist der Einstieg.
           */
          id: 'members',
          scope: 'community',
          labelKey: 'admin.nav.members',
          icon: 'i-ph-users-three',
          to: '/dashboard/community/members',
          requiredCapability: 'team.manage',
          order: 30,
        },
        {
          /**
           * EIGENE DOMAIN (control-035, Davids Entscheidungen vom 2026-08-07).
           *
           * `community.domain` trägt nur der OWNER — ein Admin sieht den
           * Reiter gar nicht erst. Die AUTORITÄT ist trotzdem der Server: die
           * Routen prüfen dieselbe Capability, und das Control Plane prüft sie
           * danach noch einmal selbst.
           *
           * KEIN Plan-Gate am Reiter, obwohl das Merkmal ab Pro ist (Davids
           * Entscheidung 1): ein Owner soll ERFAHREN, dass es eigene Domains
           * gibt. Die Seite selbst zeigt ihm dann, was ihm fehlt, und verlinkt
           * auf den Plan-Reiter. Ein Reiter, der bei Basic verschwindet,
           * verkauft nichts und erklärt nichts.
           */
          id: 'community-domain',
          scope: 'community',
          labelKey: 'onboarding.domain.navLabel',
          icon: 'i-ph-globe-hemisphere-west',
          to: '/dashboard/community/domain',
          requiredCapability: 'community.domain',
          order: 40,
        },
        {
          /**
           * PLAN — Abo, Kauf und Stripe-Portal (A6 Schritt 3).
           * `community.billing` trägt nur der Owner; ein Admin sieht den Reiter
           * gar nicht erst.
           *
           * Der PFAD ist fest verdrahtet und nicht frei wählbar: die
           * Erfolgs-/Abbruch-URLs des Checkouts baut der Server aus
           * `tenants.host` (apps/control/server/utils/communityCheckout.ts).
           * Wer ihn hier ändert, ändert ihn dort mit.
           */
          id: 'site-subscription',
          scope: 'community',
          labelKey: 'onboarding.communityTabs.plan',
          icon: 'i-ph-credit-card',
          to: '/dashboard/community/plan',
          requiredCapability: 'community.billing',
          order: 50,
        },
      ],
      /**
       * Der Hinweis auf die ablaufende Testphase (M13). Aus DEMSELBEN Grund in
       * diesem Layer wie der Plan-Reiter: er lebt von `/api/community/billing/trial`,
       * und die braucht den Mandanten-Kontext, den nur eine Pool-App hat. Eine
       * Silo-App ohne onboarding trägt den Eintrag nicht — dort gibt es keine
       * Testphase, also erscheint auch nichts.
       *
       * Dieselbe Capability wie der Plan-Reiter, auf den er zeigt: `community.billing`
       * trägt nur der Owner. Ein Moderator bekäme sonst einen Hinweis mit einem
       * Knopf in ein 403 — und eine Auskunft über den Vertrag seiner Community,
       * die ihn nichts angeht.
       */
      notices: {
        /**
         * Die Sperre steht VOR der Testphase (M13): eine nur-lesende Community
         * ist die dringlichere Nachricht, und beides gleichzeitig gibt es
         * praktisch nicht — eine Testphase kann nichts schulden. Dieselbe
         * Capability wie der Plan-Reiter, auf den der Knopf zeigt.
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
