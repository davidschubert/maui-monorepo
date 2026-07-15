import type { FeatureManifest } from '../../shared/types/manifest'

/**
 * Laufzeit-Registry der Feature-Manifeste (F2/F7): Jeder Feature-Layer
 * registriert sein Manifest per Nitro-Plugin (server/plugins/
 * feature-manifest.ts) — gleiches Vertragsmuster wie
 * registerUserDataContributor. Der Core kennt so zur Laufzeit alle
 * EINKOMPILIERTEN Features (Katalog-Quelle + Enforcement-Grundlage),
 * ohne die Layer zu kennen.
 *
 * Das Manifest-FILE bleibt `import type`-only (check:manifests erzwingt
 * das) — den Wert-Import macht das Plugin.
 */

const registry = new Map<string, FeatureManifest>()

export function registerFeatureManifest(manifest: FeatureManifest): void {
  registry.set(manifest.key, manifest)
}

/** Alle einkompilierten Feature-Manifeste (Key → Manifest). */
export function getFeatureRegistry(): ReadonlyMap<string, FeatureManifest> {
  return registry
}
