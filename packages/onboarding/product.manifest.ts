import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'onboarding',
  // foundation: kein zubuchbares Kunden-Feature, sondern der Trichter der
  // Plattform selbst — er wird nie pro Site an- oder abgeschaltet.
  tier: 'foundation',
  hasMigrations: false,
  apiPrefixes: ['/api/onboarding'],
  title: { en: 'Onboarding', de: 'Onboarding' },
  description: {
    en: 'Public self-service funnel: sign up, set up a community in seven steps, land in it.',
    de: 'Öffentlicher Selbstbedienungs-Trichter: registrieren, Community in sieben Schritten einrichten, drin sein.',
  },
  icon: 'i-ph-rocket-launch',
} satisfies FeatureManifest
