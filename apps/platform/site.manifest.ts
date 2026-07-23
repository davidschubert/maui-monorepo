import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Feature-Wahl dieser Site — Single Source of Truth. Beim Ableiten einer
 * neuen App zuerst HIER die Features wählen, dann `extends` (nuxt.config.ts)
 * und die @maui/*-Dependencies (package.json) anpassen —
 * `pnpm check:manifests` meldet jede Abweichung. core + system sind
 * implizit immer dabei; comments zieht moderation zwingend mit (requires).
 *
 * Die Reihenfolge HIER ist egal (Menge, keine Rangfolge) — die
 * Prioritäts-Reihenfolge in `extends` diktiert die kanonische
 * EXTENDS_ORDER in scripts/check-manifests.mjs.
 */
export default {
  siteId: 'platform',
  features: [
    'themes',
    'admin',
    'comments',
    'moderation',
  ],
} satisfies SiteManifest
