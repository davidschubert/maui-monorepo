import type { ProductManifest } from '../../../../../core/shared/types/manifest'
import type { ProductRuntimeState } from '../../../../../core/shared/types/config'

export interface AdminProductEntry {
  manifest: ProductManifest
  state: ProductRuntimeState
  /** In M2 schaltbar = optional-Tier (foundation ist Grundgerüst). */
  toggleable: boolean
  /** Keys AKTIVER Produkte, die dieses Produkt via requires brauchen. */
  requiredBy: string[]
}

/**
 * Produkt-Katalog fürs Admin-Dashboard (F7-Vorstufe): einkompilierte
 * Produkte aus der Laufzeit-Registry + effektiver Gate-Zustand.
 */
export default defineEventHandler(async (event): Promise<{ products: AdminProductEntry[] }> => {
  requirePermission(event, 'system.manage')

  const registry = getProductRegistry()
  const states = await getEffectiveProducts(event)

  const products: AdminProductEntry[] = []
  for (const manifest of registry.values()) {
    const requiredBy = [...registry.values()]
      .filter(m => m.requires?.includes(manifest.key) && (states[m.key]?.enabled ?? true))
      .map(m => m.key)
    products.push({
      manifest,
      state: states[manifest.key] ?? { enabled: true, status: 'active' },
      toggleable: manifest.tier === 'optional',
      requiredBy,
    })
  }
  // foundation zuerst, dann alphabetisch — stabile Katalog-Reihenfolge
  products.sort((a, b) => (a.manifest.tier === b.manifest.tier
    ? a.manifest.key.localeCompare(b.manifest.key)
    : a.manifest.tier === 'foundation' ? -1 : 1))

  return { products }
})
