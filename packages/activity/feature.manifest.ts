import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'activity',
  tier: 'optional',
  // Liest nur die system-eigene activities-Table (recordActivity im Core) —
  // keine harten Layer-Abhängigkeiten, ohne Content-Features nur leerer.
  hasMigrations: false,
  apiPrefixes: ['/api/activity'],
  title: { en: 'Activity Feed', de: 'Activity-Feed' },
  description: {
    en: 'Chronological activity feed of what happens on the site (posts, comments, signups).',
    de: 'Chronologischer Activity-Feed der Site-Ereignisse (Beiträge, Kommentare, Anmeldungen).',
  },
  icon: 'i-ph-pulse',
} satisfies FeatureManifest
