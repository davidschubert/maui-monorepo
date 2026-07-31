/**
 * Eigene Community-Rolle des eingeloggten Users auf DIESEM Mandanten-Host (N1).
 *
 * Konsument ist der Auth-Store nach einem CLIENT-Login (der SSR-Spiegel aus
 * tenant-brand.server.ts ist dann veraltet, weil die Seite nicht neu lädt).
 * Gibt bewusst NUR den eigenen Rollen-String zurück — keine fremden Daten,
 * die Capabilities leitet der Client aus der geteilten Matrix ab.
 *
 * Fail-closed wie resolveCommunityRole: Gast, kein Tenant, kein Resolver oder
 * Resolver-Fehler ⇒ { role: null }. Kein 401/403 — „keine Rolle" ist hier
 * eine gültige Antwort, kein Fehler (Silo-Apps/Kontroll-Hosts inklusive).
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) return { role: null }
  try {
    return { role: await resolveCommunityRole(event) }
  }
  catch {
    return { role: null }
  }
})
