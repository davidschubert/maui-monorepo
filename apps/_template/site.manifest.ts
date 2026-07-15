import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Feature-Wahl dieser Site — Single Source of Truth. Beim Ableiten einer
 * neuen App zuerst HIER die Features wählen, dann `extends` (nuxt.config.ts)
 * und die @maui/*-Dependencies (package.json) anpassen —
 * `pnpm check:manifests` meldet jede Abweichung. core + system sind
 * implizit immer dabei; comments zieht moderation zwingend mit (requires).
 */
export default {
  siteId: 'template',
  features: [
    'themes',
    'admin',
    'comments',
    'moderation',
  ],
} satisfies SiteManifest
