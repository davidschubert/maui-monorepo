import { createTenantsTableResolver } from '../../../../packages/studio/server/utils/tenantsResolver'

/**
 * A14-Komposition: die APP verdrahtet den core-Resolver-Vertrag mit der
 * tenants-Table des Control Plane (studio-Layer-Utility). Die Verbindung ist
 * ein CROSS-Projekt-Read mit eigenem read-only-Key (Scope rows.read auf das
 * Control-Plane-Projekt) — bewusst getrennt vom Pool-Runtime-Key der App.
 *
 * Ohne NUXT_PLATFORM_CONTROL_*-Env (z. B. CI-Build) wird KEIN Resolver
 * registriert → die Tenant-Middleware ist dokumentiert fail-open (No-Op);
 * die Warnung macht die Fehlkonfiguration im Log sichtbar.
 */
export default defineNitroPlugin(() => {
  const endpoint = process.env.NUXT_PLATFORM_CONTROL_ENDPOINT
  const projectId = process.env.NUXT_PLATFORM_CONTROL_PROJECT_ID
  const databaseId = process.env.NUXT_PLATFORM_CONTROL_DATABASE_ID
  const apiKey = process.env.NUXT_PLATFORM_CONTROL_KEY
  if (!endpoint || !projectId || !databaseId || !apiKey) {
    console.warn('[platform] NUXT_PLATFORM_CONTROL_* unvollständig — kein Tenant-Resolver registriert (alle Hosts laufen als Single-Tenant)')
    return
  }
  registerTenantResolver(createTenantsTableResolver({ endpoint, projectId, apiKey, databaseId }))
})
