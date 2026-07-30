/**
 * onboarding meldet die MITGLIEDER-Verwaltung bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged) — capability-gefiltert über `team.manage`.
 *
 * WARUM DIESER LAYER: die Seite kann nur so weit reichen wie ihre Routen, und die
 * liegen hier (`/api/site/members/*`) — dieser Layer besitzt die Service-Naht zum
 * Control Plane, dem `site_members`/`site_invites` gehören. Läge der Eintrag im
 * admin-Layer, hätte die Silo-App (apps/comments, ohne onboarding) einen
 * Menüpunkt, dessen Seite ins Leere greift. Eine Silo-Instanz hat auch keine
 * Community-Grenze: dort verwaltet der Betreiber Nutzer über /dashboard/users.
 *
 * `team.manage` war bis heute eine TOTE Capability (Audit-Befund S9): in der
 * Matrix vorhanden, im Dashboard ohne Einstieg. Dieser Eintrag ist der Einstieg.
 */
export default defineAppConfig({
  maui: {
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
      ],
    },
  },
})
