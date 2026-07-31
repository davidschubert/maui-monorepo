import type { FeatureManifest } from '../../../../../core/shared/types/manifest'
import type { FeatureRuntimeState } from '../../../../../core/shared/types/config'

export interface AdminFeatureEntry {
  manifest: FeatureManifest
  state: FeatureRuntimeState
  /** In M2 schaltbar = optional-Tier (foundation ist Grundgerüst). */
  toggleable: boolean
  /** Keys AKTIVER Features, die dieses Feature via requires brauchen. */
  requiredBy: string[]
}

/**
 * Feature-Katalog fürs Admin-Dashboard (F7-Vorstufe): einkompilierte
 * Features aus der Laufzeit-Registry + effektiver Gate-Zustand.
 */
export default defineEventHandler(async (event): Promise<{ features: AdminFeatureEntry[] }> => {
  requirePermission(event, 'system.manage')

  const registry = getFeatureRegistry()
  const states = await getEffectiveFeatures(event)

  const features: AdminFeatureEntry[] = []
  for (const manifest of registry.values()) {
    const requiredBy = [...registry.values()]
      .filter(m => m.requires?.includes(manifest.key) && (states[m.key]?.enabled ?? true))
      .map(m => m.key)
    features.push({
      manifest,
      state: states[manifest.key] ?? { enabled: true, status: 'active' },
      toggleable: manifest.tier === 'optional',
      requiredBy,
    })
  }
  // foundation zuerst, dann alphabetisch — stabile Katalog-Reihenfolge
  features.sort((a, b) => (a.manifest.tier === b.manifest.tier
    ? a.manifest.key.localeCompare(b.manifest.key)
    : a.manifest.tier === 'foundation' ? -1 : 1))

  return { features }
})
