import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Feature-Wahl der Marketing-Startseite (pukalani.app). core + system sind
 * implizit Fundament; themes liefert die Farbwelten-Vorschau + das Licht-Motiv.
 * `pnpm check:manifests` hält extends + package.json konsistent.
 */
export default {
  siteId: 'marketing',
  features: [
    'themes',
  ],
} satisfies SiteManifest
