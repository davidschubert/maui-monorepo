/**
 * Zentrales Feature-Enforcement (F2/M2): matcht API-Pfade gegen die
 * apiPrefixes der registrierten Manifeste — abgeschaltetes Feature ⇒ 404
 * für ALLE seine Routen, ohne einzelne Handler anzufassen. Die UI blendet
 * nur aus; diese Middleware ist die Autorität.
 *
 * Foundation-Features sind in M2 nicht schaltbar (Admin-Route verweigert
 * das) — die Middleware selbst behandelt alle Registry-Einträge gleich.
 */
export default defineEventHandler(async (event) => {
  const path = event.path
  if (!path.startsWith('/api/')) return

  for (const manifest of getFeatureRegistry().values()) {
    if (!manifest.apiPrefixes?.length) continue
    if (manifest.apiPrefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`))) {
      await requireFeature(event, manifest.key)
      return
    }
  }
})
