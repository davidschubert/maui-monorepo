import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Produkt-Wahl dieser Site (generiert von create-site) — Single Source of
 * Truth; `pnpm check:manifests` hält extends + package.json konsistent.
 * core + system sind implizit immer dabei; Reihenfolge hier egal (Menge).
 */
export default {
  siteId: 'portfolio',
  products: [
    'themes',
    'admin',
    // Besucherstatistik (2026-08-04): misst schon über einen fest
    // konfigurierten `src`; der Layer macht die Site im Dashboard wechselbar,
    // ohne dass dafür deployt werden muss.
    'analytics',
  ],
} satisfies SiteManifest
