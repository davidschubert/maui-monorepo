import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Produkt-Wahl dieser Site — Single Source of Truth. `extends` in
 * nuxt.config.ts und die @pukalani/*-Dependencies in package.json müssen dazu
 * passen; `pnpm check:manifests` erzwingt das (CI). core + system sind
 * implizit immer dabei. Die Reihenfolge HIER ist egal (Menge) — die
 * extends-Priorität diktiert EXTENDS_ORDER in scripts/check-manifests.mjs.
 */
export default {
  siteId: 'comments',
  products: [
    'themes',
    'admin',
    'blueprint',
    'comments',
    'posts',
    'events',
    'media',
    // 'feedback' + 'tickets' sind mit E10 nach apps/control gezogen
    // (Davids Entscheidung 7) — hier bewusst NICHT mehr gewählt.
    'billing',
    'courses',
    'activity',
    'moderation',
  ],
} satisfies SiteManifest
