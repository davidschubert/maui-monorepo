import type { FeatureManifest } from './shared/types/manifest'

export default {
  key: 'core',
  tier: 'foundation',
  hasMigrations: false,
  title: { en: 'Core', de: 'Core' },
  description: {
    en: 'Foundation layer: authentication, profiles, notifications, realtime, design system and shared utilities. Owns no tables.',
    de: 'Fundament-Layer: Auth, Profile, Benachrichtigungen, Realtime, Design-Fundament und geteilte Utilities. Besitzt keine Tables.',
  },
  icon: 'i-ph-cube',
} satisfies FeatureManifest
