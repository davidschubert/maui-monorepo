import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Feature-Wahl dieser Site (generiert von create-site) — Single Source of
 * Truth; `pnpm check:manifests` hält extends + package.json konsistent.
 * core + system sind implizit immer dabei; Reihenfolge hier egal (Menge).
 */
export default {
  siteId: 'photos',
  features: [
    'themes',
    'admin',
    'media',
  ],
} satisfies SiteManifest
