import type { ProductManifest } from '../../shared/types/manifest'

/**
 * Laufzeit-Registry der Produkt-Manifeste (F2/F7): Jeder Produkt-Layer
 * registriert sein Manifest per Nitro-Plugin (server/plugins/
 * product-manifest.ts) — gleiches Vertragsmuster wie
 * registerUserDataContributor. Der Core kennt so zur Laufzeit alle
 * EINKOMPILIERTEN Produkte (Katalog-Quelle + Enforcement-Grundlage),
 * ohne die Layer zu kennen.
 *
 * Das Manifest-FILE bleibt `import type`-only (check:manifests erzwingt
 * das) — den Wert-Import macht das Plugin.
 */

const registry = new Map<string, ProductManifest>()

export function registerProductManifest(manifest: ProductManifest): void {
  registry.set(manifest.key, manifest)
}

/** Alle einkompilierten Produkt-Manifeste (Key → Manifest). */
export function getProductRegistry(): ReadonlyMap<string, ProductManifest> {
  return registry
}
