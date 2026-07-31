/**
 * onboarding meldet die MITGLIEDER-Verwaltung bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — capability-gefiltert über `team.manage`.
 *
 * WARUM DIESER LAYER: die Seite kann nur so weit reichen wie ihre Routen, und die
 * liegen hier (`/api/site/members/*`) — dieser Layer besitzt die Service-Naht zum
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
          id: 'members',
          labelKey: 'admin.nav.members',
          icon: 'i-ph-users-three',
          to: '/dashboard/members',
          requiredCapability: 'team.manage',
          group: 'management',
          order: 2,
        },
        {
          /**
           * Abo & Rechnung der Community (A6 Schritt 3). Aus DEMSELBEN Grund in
           * diesem Layer wie die Mitglieder: die Seite lebt von
           * `/api/site/billing/*`, und die brauchen die Service-Naht zum Control
           * Plane. `billing.manage` trägt nur der Owner — ein Admin sieht den
           * Punkt gar nicht erst.
           *
           * Der Pfad liegt unter /dashboard/settings, weil der Stripe-Checkout
           * genau dorthin zurückführt (Erfolgs-/Abbruch-URL aus tenants.host).
           */
          id: 'site-subscription',
          labelKey: 'onboarding.nav.subscription',
          icon: 'i-ph-credit-card',
          to: '/dashboard/settings/subscription',
          requiredCapability: 'billing.manage',
          group: 'management',
          order: 3,
        },
      ],
    },
  },
})
