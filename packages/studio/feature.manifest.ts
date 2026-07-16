import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'studio',
  tier: 'optional',
  hasMigrations: true,
  apiPrefixes: ['/api/studio'],
  title: { en: 'Studio (Control Plane)', de: 'Studio (Control Plane)' },
  description: {
    en: 'The platform control plane: site registry, health overview and (later) provisioning and entitlements. Runs only on the studio site.',
    de: 'Das Control Plane der Plattform: Sites-Register, Health-Übersicht und (später) Provisionierung und Entitlements. Läuft nur auf der Studio-Site.',
  },
  icon: 'i-ph-globe-hemisphere-west',
} satisfies FeatureManifest
