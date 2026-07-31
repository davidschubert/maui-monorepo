import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'control',
  tier: 'optional',
  hasMigrations: true,
  apiPrefixes: ['/api/control'],
  title: { en: 'Control Plane', de: 'Control Plane' },
  description: {
    en: 'The platform control plane: site registry, health overview, provisioning and entitlements. Runs only on the control site.',
    de: 'Das Control Plane der Plattform: Sites-Register, Health-Übersicht, Provisionierung und Entitlements. Läuft nur auf der Control-Site.',
  },
  icon: 'i-ph-globe-hemisphere-west',
} satisfies FeatureManifest
