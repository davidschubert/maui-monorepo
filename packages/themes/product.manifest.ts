import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'themes',
  tier: 'foundation',
  // Tables (custom_themes/custom_fonts) besitzt der system-Layer (A14).
  hasMigrations: false,
  title: { en: 'Theme Studio', de: 'Theme-Studio' },
  description: {
    en: 'Custom themes and fonts: gallery, editor with live preview, runtime color ramps and self-hosted font uploads.',
    de: 'Custom Themes und Schriften: Galerie, Editor mit Live-Vorschau, Laufzeit-Farbrampen und selbst gehostete Font-Uploads.',
  },
  icon: 'i-ph-palette',
} satisfies FeatureManifest
