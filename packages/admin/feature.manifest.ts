import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'admin',
  tier: 'foundation',
  hasMigrations: true,
  title: { en: 'Admin Dashboard', de: 'Admin-Dashboard' },
  description: {
    en: 'Dashboard shell with module registry, user management, moderation UI, global search and runtime configuration.',
    de: 'Dashboard-Gerüst mit Modul-Registry, Nutzerverwaltung, Moderations-UI, globaler Suche und Laufzeit-Konfiguration.',
  },
  icon: 'i-ph-squares-four',
} satisfies FeatureManifest
