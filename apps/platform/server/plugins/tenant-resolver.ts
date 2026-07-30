import { createTenantsTableResolver } from '../../../../packages/control/server/utils/tenantsResolver'
import { createFormerSiteMembersResolver, createSiteMembersResolver } from '../../../../packages/control/server/utils/siteMembersResolver'

/**
 * A14-Komposition: die APP verdrahtet die core-Resolver-Verträge mit den
 * Tabellen des Control Plane (studio-Layer-Utilities). Beide sind CROSS-Projekt-
 * Reads mit demselben read-only-Key (Scope rows.read auf das Control-Plane-
 * Projekt) — bewusst getrennt vom Pool-Runtime-Key der App.
 *
 *  - tenants-Resolver: Host → TenantContext (inkl. siteId = tenants.$id).
 *  - site_members-Resolver: {siteId, runtimeProjectId, runtimeUserId} → Rolle
 *    (G1, requireTenantPermission). Dieselbe Verbindung, eigener Cache.
 *  - GEBÜNDELTER Ehemaligen-Resolver (N9): viele runtimeUserIds → wer von ihnen
 *    aus DIESER Community entfernt wurde. Eigener Vertrag, weil eine
 *    Kommentarliste 25 Autoren hat und der Einzel-Lookup daraus 25
 *    Cross-Projekt-Abfragen machen würde; Cache pro Nutzer, 60 s, fail-soft.
 *
 * Ohne NUXT_PLATFORM_CONTROL_*-Env (z. B. CI-Build) wird KEIN Resolver
 * registriert → die Tenant-Middleware ist dokumentiert fail-open (No-Op) und
 * requireTenantPermission fail-closed (kein Resolver → 403); die Warnung macht
 * die Fehlkonfiguration im Log sichtbar.
 */
export default defineNitroPlugin(() => {
  const endpoint = process.env.NUXT_PLATFORM_CONTROL_ENDPOINT
  const projectId = process.env.NUXT_PLATFORM_CONTROL_PROJECT_ID
  const databaseId = process.env.NUXT_PLATFORM_CONTROL_DATABASE_ID
  const apiKey = process.env.NUXT_PLATFORM_CONTROL_KEY
  if (!endpoint || !projectId || !databaseId || !apiKey) {
    console.warn('[platform] NUXT_PLATFORM_CONTROL_* unvollständig — kein Tenant-/Site-Rollen-Resolver registriert (alle Hosts laufen als Single-Tenant)')
    return
  }
  registerTenantResolver(createTenantsTableResolver({ endpoint, projectId, apiKey, databaseId }))
  registerSiteRoleResolver(createSiteMembersResolver({ endpoint, projectId, apiKey, databaseId }))
  registerFormerSiteMembersResolver(createFormerSiteMembersResolver({ endpoint, projectId, apiKey, databaseId }))
})
