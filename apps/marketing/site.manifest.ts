import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Feature-Wahl der Marketing-Startseite (pukalani.app). Nur das Fundament
 * (core + system, implizit) — keine Feature-Layer: die Seite ist öffentlich +
 * statisch. `pnpm check:manifests` hält extends + package.json konsistent.
 */
export default {
  siteId: 'marketing',
  features: [],
} satisfies SiteManifest
