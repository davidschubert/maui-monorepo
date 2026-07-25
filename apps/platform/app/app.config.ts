export default defineAppConfig({
  maui: {
    // DIE Multi-Tenant-App (Horizont 3): das Tenant-Gate ist hier AN — die
    // Middleware 00.tenant.ts (core) löst jeden Request-Host über den in
    // server/plugins/tenant-resolver.ts registrierten Resolver auf.
    // Unbekannte Hosts bekommen 404; Pool-Hosts arbeiten zeilen-gescoped
    // (scopeQuery/scopeRow, z. B. comments-011).
    tenancy: {
      enabled: true,
      // Der Kundenbereich (Self-Service-Onboarding, SAAS-ROADMAP #1) läuft auf
      // DEMSELBEN Deployment, ist aber kein Mandant. `app` ist in
      // RESERVED_SUBDOMAINS gesperrt, kann also niemals ein Tenant-Host werden;
      // die Wildcard-DNS `*.pukalani.app` zeigt schon hierher — es braucht
      // also keine neue ploi-Site. Lokal per
      // NUXT_PUBLIC_TENANCY_CONTROL_HOSTS=app.localhost überschreiben.
      controlHosts: ['app.pukalani.app'],
      // H3-4.3 Quota (Blueprint S4): Pool-Kunden erschöpfen den geteilten
      // Server nicht. PRO PLAN gestaffelt (David-Freigabe 2026-07-23) — der
      // Tenant trägt seinen Plan (tenants.plan, studio-013, Default free).
      // Silo-Tenants: kein Limit (eigenes Projekt). perDay = rollierende 24 h.
      quota: {
        enabled: true,
        plans: {
          free: { comments: { perDay: 200, total: 5_000 } },
          pro: { comments: { perDay: 1000, total: 50_000 } },
          business: { comments: { perDay: 5000, total: 250_000 } },
        },
      },
    },
  },
  ui: {},
})
