/**
 * Playground-Resolver (Horizont-3 Scharf-Dogfood) — In-Memory statt
 * tenants-Table: der Playground hat kein Control Plane; die Table-Variante
 * (createTenantsTableResolver, studio-Layer) ist separat integrationsgetestet.
 *
 *  localhost / 127.0.0.1  → silo aufs eigene Projekt (Dev-Betrieb wie immer)
 *  pool-demo.localhost    → pool, tenantId 't-demo' (Naht-3-Scope greifbar)
 *  alles andere           → null → Middleware antwortet 404
 */
export default defineNitroPlugin(() => {
  const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID ?? 'playground'
  const register: Record<string, ReturnType<typeof silo> | ReturnType<typeof pool>> = {
    'localhost': silo(projectId),
    '127.0.0.1': silo(projectId),
    'pool-demo.localhost': pool(projectId, 't-demo'),
  }
  registerTenantResolver(host => register[host] ?? null)

  function silo(id: string) {
    return { mode: 'silo' as const, projectId: id }
  }
  function pool(id: string, tenantId: string) {
    return { mode: 'pool' as const, projectId: id, tenantId }
  }
})
