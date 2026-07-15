import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Feature-Wahl dieser Site — Single Source of Truth. `extends` in
 * nuxt.config.ts und die @maui/*-Dependencies in package.json müssen dazu
 * passen; `pnpm check:manifests` erzwingt das (CI). core + system sind
 * implizit immer dabei. Die Reihenfolge HIER ist egal (Menge) — die
 * extends-Priorität diktiert EXTENDS_ORDER in scripts/check-manifests.mjs.
 */
export default {
  siteId: 'reddit-comments',
  features: [
    'themes',
    'admin',
    'comments',
    'posts',
    'events',
    'media',
    'feedback',
    'billing',
    'courses',
    'tickets',
    'activity',
    'moderation',
  ],
} satisfies SiteManifest
