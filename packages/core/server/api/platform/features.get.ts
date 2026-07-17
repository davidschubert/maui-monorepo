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
  const cached = snapshotCache.get('features')
  if (cached) return cached

  const states = await getEffectiveFeatures(event)
  const response = {
    features: Object.entries(states)
      .filter(([, state]) => state.enabled && state.status === 'active')
      .map(([key]) => key)
      .sort(),
  }
  snapshotCache.set('features', response)
  return response
})
