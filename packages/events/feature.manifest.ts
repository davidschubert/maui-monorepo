import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'events',
  tier: 'optional',
  hasMigrations: true,
  title: { en: 'Events', de: 'Events' },
  description: {
    en: 'Events with series, RSVPs and tickets — including an embeddable event view.',
    de: 'Events mit Serien, Zusagen und Tickets — inklusive einbettbarer Event-Ansicht.',
  },
  icon: 'i-ph-calendar',
} satisfies FeatureManifest
