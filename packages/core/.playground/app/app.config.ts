export default defineAppConfig({
  maui: {
    // Horizont-3 SCHARF-Dogfood: der Playground fährt die Tenant-Middleware
    // AKTIV (einzige Umgebung mit Gate an) — der Resolver steht in
    // server/plugins/tenant-resolver.ts, die Sicht in /api/_tenant.
    // localhost ist als silo aufs eigene Projekt registriert → normaler
    // Core-Dev-Betrieb bleibt unverändert; unbekannte Hosts bekommen 404.
    tenancy: { enabled: true },
  },
})
