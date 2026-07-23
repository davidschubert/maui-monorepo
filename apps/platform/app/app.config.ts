export default defineAppConfig({
  maui: {
    // DIE Multi-Tenant-App (Horizont 3): das Tenant-Gate ist hier AN — die
    // Middleware 00.tenant.ts (core) löst jeden Request-Host über den in
    // server/plugins/tenant-resolver.ts registrierten Resolver auf.
    // Unbekannte Hosts bekommen 404; Pool-Hosts arbeiten zeilen-gescoped
    // (scopeQuery/scopeRow, z. B. comments-011).
    tenancy: { enabled: true },
  },
  ui: {},
})
