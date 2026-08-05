import manifest from '../../product.manifest'

/** Registriert das Produkt-Manifest beim Core (Laufzeit-Registry, F2/F7). */
export default defineNitroPlugin(() => {
  registerProductManifest(manifest)
})
