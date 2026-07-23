export default defineAppConfig({
  maui: {
    // DIE Multi-Tenant-App (Horizont 3): das Tenant-Gate ist hier AN — die
    // Middleware 00.tenant.ts (core) löst jeden Request-Host über den in
    // server/plugins/tenant-resolver.ts registrierten Resolver auf.
    // Unbekannte Hosts bekommen 404; Pool-Hosts arbeiten zeilen-gescoped
    // (scopeQuery/scopeRow, z. B. comments-011).
    tenancy: {
      enabled: true,
      // H3-4.3 Quota (Blueprint S4): Pool-Kunden erschöpfen den geteilten
      // Server nicht. Zahlen = Vorschlag „pro"-Niveau als Pool-Default,
      // solange Tenants noch keinem Plan zugeordnet sind (Katalog-Vorschlag
      // in docs/OPEN-ITEMS.md, David nickt ab). Silo-Tenants: kein Limit
      // (eigenes Projekt). perDay = rollierende 24 h.
      quota: {
        enabled: true,
        comments: { perDay: 1000, total: 50_000 },
      },
    },
  },
  ui: {},
})
