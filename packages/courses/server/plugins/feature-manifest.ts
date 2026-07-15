import manifest from '../../feature.manifest'

/** Registriert das Feature-Manifest beim Core (Laufzeit-Registry, F2/F7). */
export default defineNitroPlugin(() => {
  registerFeatureManifest(manifest)
})
