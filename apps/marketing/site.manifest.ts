import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Produkt-Wahl der Marketing-Startseite (pukalani.app). Nur das Fundament
 * (core + system, implizit) — keine Produkt-Layer: die Seite ist öffentlich +
 * statisch. `pnpm check:manifests` hält extends + package.json konsistent.
 */
export default {
  siteId: 'marketing',
  products: [],
} satisfies SiteManifest
