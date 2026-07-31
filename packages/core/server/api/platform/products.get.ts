/**
 * Öffentlicher Feature-Snapshot der Site (M6-T4/L6): Liste der aktuell
 * WIRKSAM aktiven Feature-Keys — das Control Plane pollt sie im Health-Sweep
 * (§ 8: Studio hält keine Site-Keys, deshalb bewusst eine unauthentifizierte,
 * minimale Oberfläche). Nur Keys, keine Settings/Status-Details: welche
 * Features an sind, verrät auch die UI; deaktivierte 404en ohnehin an ihren
 * Routen. Microcache 60 s — öffentlich + ungedrosselt, user-agnostisch.
 */
const snapshotCache = createMicrocache<{ features: string[] }>(60_000)

export default defineEventHandler(async (event) => {
  // Cross-Tenant-Cache-Regel (H3): Silo-Tenants zeigen auf ein anderes Projekt,
  // Pool-Tenants können künftig eigene Gates haben — Key trägt den Tenant.
  const cacheKey = `features:${tenantCacheScope(event)}`
  const cached = snapshotCache.get(cacheKey)
  if (cached) return cached

  const states = await getEffectiveFeatures(event)
  const response = {
    features: Object.entries(states)
      .filter(([, state]) => state.enabled && state.status === 'active')
      .map(([key]) => key)
      .sort(),
  }
  snapshotCache.set(cacheKey, response)
  return response
})
