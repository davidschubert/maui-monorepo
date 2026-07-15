import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Feature-Wahl dieser Site — Single Source of Truth. `extends` in
 * nuxt.config.ts und die @maui/*-Dependencies in package.json müssen dazu
 * passen; `pnpm check:manifests` erzwingt das (CI). core + system sind
 * implizit immer dabei.
 */
export default {
  siteId: 'reddit-comments',
  features: [
    'themes',
    'admin',
    'comments',
    'posts',
    'events',
    'feedback',
    'billing',
    'courses',
    'tickets',
    'feed',
    'moderation',
  ],
} satisfies SiteManifest
